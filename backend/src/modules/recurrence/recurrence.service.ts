// RecurrenceService: template management (task 9.1) + instance generation
// (task 9.2) + DeliveriesService wiring support (task 10.1) + business
// event logging (task 10.2, design.md "Backend/recurrence", Requirements
// 5.1, 5.2, 5.5-5.9, 5.6, 5.7, 8.3-8.7, 9.1-9.4, 10.2).
import { randomUUID } from "node:crypto";
import type { Case } from "@prisma/client";
import { Prisma } from "@prisma/client";
// `rrule` ships no "exports" map, so Node's native ESM loader (unlike
// Vitest's transform, which masked this) can't always detect its named CJS
// exports — import the CJS default and destructure instead.
import rrulePackage, { type Options as RRuleOptions } from "rrule";
const { RRule } = rrulePackage;
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import { holidaysService } from "../holidays/holiday.service.js";
import { formatDateOnly, parseDateOnly } from "../holidays/holiday.repository.js";
import { tasksService } from "../tasks/task.service.js";
import { isUniqueConstraintViolation, recurrenceRepository } from "./recurrence.repository.js";
import type {
  IntervalUnit,
  NonBusinessDayPolicy,
  RecurringTaskTemplate,
  RegisterTemplateInput,
  Task,
} from "./recurrence.types.js";

// design.md RecurrenceService Implementation Notes: onCaseCreated/
// onCaseEndDateChanged both dereference `endDate` internally, and
// design.md's Boundary Commitments guarantee case.service.ts only invokes
// them after narrowing a case's endDate to non-null — this local type
// captures that guarantee at the type level so the (unchanged) function
// bodies below type-check as always operating on a present endDate.
type CaseWithEndDate = Omit<Case, "endDate"> & { endDate: Date };

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

// design.md RecurrenceService Preconditions.
function validateRegisterInput(input: RegisterTemplateInput): void {
  if (input.title.trim().length === 0) {
    throw badRequest("title is required");
  }
  if (input.kind === "fixed_interval") {
    if (!input.intervalUnit || input.intervalValue === undefined) {
      throw badRequest("fixed_interval templates require intervalUnit and intervalValue");
    }
    if (!Number.isInteger(input.intervalValue) || input.intervalValue < 1) {
      throw badRequest("intervalValue must be a positive integer");
    }
  } else {
    if (input.caseOffsetDays === undefined) {
      throw badRequest("case_relative templates require caseOffsetDays");
    }
    if (!Number.isInteger(input.caseOffsetDays) || input.caseOffsetDays < 0) {
      throw badRequest("caseOffsetDays must be a non-negative integer");
    }
    // design.md Logical Data Model: boundCaseId is only settable when
    // kind="fixed_interval"; case_relative is always a global setting.
    if (input.boundCaseId !== undefined) {
      throw badRequest("boundCaseId cannot be set on a case_relative template");
    }
  }
}

export const recurrenceService = {
  async registerTemplate(input: RegisterTemplateInput): Promise<RecurringTaskTemplate> {
    validateRegisterInput(input);
    return recurrenceRepository.create({ ...input, title: input.title.trim() });
  },

  async stopTemplate(templateId: string): Promise<void> {
    try {
      await recurrenceRepository.stop(templateId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Recurring task template not found: ${templateId}`);
      }
      throw error;
    }
  },

  async deleteTemplate(templateId: string, requestId: string = randomUUID()): Promise<void> {
    try {
      await recurrenceRepository.remove(templateId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Recurring task template not found: ${templateId}`);
      }
      throw error;
    }
    businessEventLogger.logBusinessEvent("recurring_task_template.deleted", { requestId, entityId: templateId });
  },

  list(): Promise<RecurringTaskTemplate[]> {
    return recurrenceRepository.list();
  },

  // design.md Batch/Job Contract: fixed_interval only — case_relative
  // generation happens exclusively via onCaseCreated/
  // onCaseEndDateChanged (Requirement 5.1).
  async generateDueInstances(asOf: Date, requestId: string = randomUUID()): Promise<Task[]> {
    const templates = await recurrenceRepository.listActiveByKind("fixed_interval");
    const created: Task[] = [];

    for (const template of templates) {
      const occurrences = computeFixedIntervalOccurrences(template, asOf);
      for (const occurrence of occurrences) {
        const scheduledDate = await resolveScheduledDate(occurrence, template.nonBusinessDayPolicy);
        if (scheduledDate === null) continue; // policy=skip
        const instance = await tryCreateInstance(template, scheduledDate);
        if (instance) {
          created.push(instance);
          logInstanceGenerated(instance, requestId);
        }
      }
    }
    return created;
  },

  // Requirement 5.2, 5.8: one instance per active case_relative
  // template, offset from the case's endDate.
  async onCaseCreated(caseEntity: CaseWithEndDate, requestId: string = randomUUID()): Promise<Task[]> {
    const templates = await recurrenceRepository.listActiveByKind("case_relative");
    const created: Task[] = [];

    for (const template of templates) {
      const rawDate = addDays(formatDateOnly(caseEntity.endDate), -(template.caseOffsetDays ?? 0));
      const scheduledDate = await resolveScheduledDate(parseDateOnly(rawDate), template.nonBusinessDayPolicy);
      if (scheduledDate === null) continue; // policy=skip
      const instance = await tryCreateInstance(template, scheduledDate, caseEntity.id);
      if (instance) {
        created.push(instance);
        logInstanceGenerated(instance, requestId);
      }
    }
    return created;
  },

  // Requirement 5.4: recomputes the scheduled date of the still-incomplete
  // auto-generated instance for each active case_relative template
  // linked to this case; completed instances and templates with no
  // existing instance yet are left untouched (design.md Postconditions).
  async onCaseEndDateChanged(caseEntity: CaseWithEndDate): Promise<Task[]> {
    const templates = await recurrenceRepository.listActiveByKind("case_relative");
    const updated: Task[] = [];

    for (const template of templates) {
      const existing = await recurrenceRepository.findIncompleteInstance(template.id, caseEntity.id);
      if (!existing) continue;

      const rawDate = addDays(formatDateOnly(caseEntity.endDate), -(template.caseOffsetDays ?? 0));
      const scheduledDate = await resolveScheduledDate(parseDateOnly(rawDate), template.nonBusinessDayPolicy);
      if (scheduledDate === null) continue;

      updated.push(await recurrenceRepository.updateInstanceScheduledDate(existing.id, scheduledDate));
    }
    return updated;
  },
};

function toRRuleFrequency(unit: IntervalUnit): RRuleOptions["freq"] {
  switch (unit) {
    case "day":
      return RRule.DAILY;
    case "week":
      return RRule.WEEKLY;
    case "month":
      return RRule.MONTHLY;
  }
}

// fixed_interval templates have no explicit start-date column, so the
// template's own creation date anchors the recurrence (design.md leaves the
// anchor unspecified; `createdAt` is the only date the template carries).
function computeFixedIntervalOccurrences(template: RecurringTaskTemplate, asOf: Date): Date[] {
  const dtstart = parseDateOnly(formatDateOnly(template.createdAt));
  const rule = new RRule({
    freq: toRRuleFrequency(template.intervalUnit as IntervalUnit),
    interval: template.intervalValue ?? 1,
    dtstart,
  });
  return rule.between(dtstart, asOf, true);
}

function addDays(date: string, delta: number): string {
  const d = parseDateOnly(date);
  d.setUTCDate(d.getUTCDate() + delta);
  return formatDateOnly(d);
}

// Requirements 8.4-8.7: applies the template's non-business-day policy to a
// computed occurrence date, returning the final scheduled date, or `null`
// when the policy is "skip" and the date falls on a non-business day.
async function resolveScheduledDate(date: Date, policy: NonBusinessDayPolicy): Promise<Date | null> {
  const dateStr = formatDateOnly(date);
  if (policy === "as_is") {
    return date;
  }
  if (await holidaysService.isBusinessDay(dateStr)) {
    return date;
  }
  switch (policy) {
    case "skip":
      return null;
    case "next_business_day":
      return parseDateOnly(await holidaysService.nextBusinessDay(dateStr));
    case "previous_business_day":
      return parseDateOnly(await holidaysService.previousBusinessDay(dateStr));
  }
}

// Requirement 10.2: recurring task instance generation is a broad-impact
// business operation.
function logInstanceGenerated(instance: Task, requestId: string): void {
  businessEventLogger.logBusinessEvent("recurring_task_instance.generated", { requestId, entityId: instance.id });
}

// Goes through TasksService.create — the module's single declared entry
// point for writing a Task row — rather than a recurrence-local Prisma
// insert, so any business rule TasksService.create gains in the future
// (validation, side effects, etc.) automatically also covers
// recurrence-generated instances instead of silently diverging from them
// (design.md general architecture principle: cross-module communication
// goes through a module's Service interface).
async function tryCreateInstance(
  template: RecurringTaskTemplate,
  scheduledDate: Date,
  caseId?: string,
): Promise<Task | null> {
  let result;
  try {
    result = await tasksService.create({
      title: template.title,
      priority: template.priority,
      memo: template.defaultMemo ?? undefined,
      caseId,
      sourceTemplateId: template.id,
      scheduledDate,
    });
  } catch (error) {
    // Idempotent by construction: relies on the `(source_template_id,
    // scheduled_date)` unique constraint (task 1.3) to reject a duplicate
    // occurrence. TasksService.create only intercepts foreign-key
    // violations itself (returning a validation_error Result below), so a
    // unique-constraint violation still surfaces here as a thrown error.
    if (isUniqueConstraintViolation(error)) {
      return null; // already generated for this (template, scheduledDate) — idempotent no-op
    }
    throw error;
  }
  if (!result.ok) {
    // A template's title/caseId are trusted internal inputs (already
    // validated at template-registration time, or sourced from a real
    // Case row) — reaching a validation_error here means an
    // unexpected invariant was violated, not a normal expected outcome for
    // this caller to handle gracefully.
    const message = result.error.type === "validation_error" ? result.error.message : result.error.type;
    throw new Error(`recurrence: failed to create task instance: ${message}`);
  }
  return result.value;
}

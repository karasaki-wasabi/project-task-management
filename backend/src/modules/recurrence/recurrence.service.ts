// RecurrenceService: template management (task 9.1) + instance generation
// (task 9.2) + DeliveriesService wiring support (task 10.1) + business
// event logging (task 10.2, design.md "Backend/recurrence", Requirements
// 5.1, 5.2, 5.5-5.9, 5.6, 5.7, 8.3-8.7, 9.1-9.4, 10.2).
import { randomUUID } from "node:crypto";
import type { Delivery } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { RRule, type Options as RRuleOptions } from "rrule";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import { holidaysService } from "../holidays/holiday.service.js";
import { formatDateOnly, parseDateOnly } from "../holidays/holiday.repository.js";
import { isUniqueConstraintViolation, recurrenceRepository } from "./recurrence.repository.js";
import type {
  IntervalUnit,
  NonBusinessDayPolicy,
  RecurringTaskTemplate,
  RegisterTemplateInput,
  Task,
} from "./recurrence.types.js";

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
    if (input.deliveryOffsetDays === undefined) {
      throw badRequest("delivery_relative templates require deliveryOffsetDays");
    }
    if (!Number.isInteger(input.deliveryOffsetDays) || input.deliveryOffsetDays < 0) {
      throw badRequest("deliveryOffsetDays must be a non-negative integer");
    }
    // design.md Logical Data Model: boundDeliveryId is only settable when
    // kind="fixed_interval"; delivery_relative is always a global setting.
    if (input.boundDeliveryId !== undefined) {
      throw badRequest("boundDeliveryId cannot be set on a delivery_relative template");
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

  // design.md Batch/Job Contract: fixed_interval only — delivery_relative
  // generation happens exclusively via onDeliveryCreated/
  // onDeliveryDueDateChanged (Requirement 5.1).
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

  // Requirement 5.2, 5.8: one instance per active delivery_relative
  // template, offset from the delivery's dueDate.
  async onDeliveryCreated(delivery: Delivery, requestId: string = randomUUID()): Promise<Task[]> {
    const templates = await recurrenceRepository.listActiveByKind("delivery_relative");
    const created: Task[] = [];

    for (const template of templates) {
      const rawDate = addDays(formatDateOnly(delivery.dueDate), -(template.deliveryOffsetDays ?? 0));
      const scheduledDate = await resolveScheduledDate(parseDateOnly(rawDate), template.nonBusinessDayPolicy);
      if (scheduledDate === null) continue; // policy=skip
      const instance = await tryCreateInstance(template, scheduledDate, delivery.id);
      if (instance) {
        created.push(instance);
        logInstanceGenerated(instance, requestId);
      }
    }
    return created;
  },

  // Requirement 5.4: recomputes the scheduled date of the still-incomplete
  // auto-generated instance for each active delivery_relative template
  // linked to this delivery; completed instances and templates with no
  // existing instance yet are left untouched (design.md Postconditions).
  async onDeliveryDueDateChanged(delivery: Delivery): Promise<Task[]> {
    const templates = await recurrenceRepository.listActiveByKind("delivery_relative");
    const updated: Task[] = [];

    for (const template of templates) {
      const existing = await recurrenceRepository.findIncompleteInstance(template.id, delivery.id);
      if (!existing) continue;

      const rawDate = addDays(formatDateOnly(delivery.dueDate), -(template.deliveryOffsetDays ?? 0));
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

async function tryCreateInstance(
  template: RecurringTaskTemplate,
  scheduledDate: Date,
  deliveryId?: string,
): Promise<Task | null> {
  try {
    return await recurrenceRepository.createInstance({ template, scheduledDate, deliveryId });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return null; // already generated for this (template, scheduledDate) — idempotent no-op
    }
    throw error;
  }
}

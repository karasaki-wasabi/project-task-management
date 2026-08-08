// RecurrenceService: case-relative template management (task 2.1) +
// schedule calculation / generation helpers (task 2.2, design.md
// "予定日計算", Requirements 2.3, 5.1, 5.6–5.8, 6.1–6.3).
// applyToCase operations land in task 3.2.
import { randomUUID } from "node:crypto";
import type { Case } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import { formatDateOnly, parseDateOnly } from "../holidays/holiday.repository.js";
import { holidaysService } from "../holidays/holiday.service.js";
import { tasksService } from "../tasks/task.service.js";
import { isUniqueConstraintViolation, recurrenceRepository } from "./recurrence.repository.js";
import type {
  CaseRelativeAnchor,
  NonBusinessDayPolicy,
  RecurringTaskTemplate,
  RegisterTemplateInput,
  Task,
} from "./recurrence.types.js";

const CASE_ANCHORS = new Set([
  "case_start",
  "case_end",
  "period_month_start",
  "period_month_end",
]);

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function validateRegisterInput(input: RegisterTemplateInput): void {
  if (input.title.trim().length === 0) {
    throw badRequest("title is required");
  }
  if (!CASE_ANCHORS.has(input.caseAnchor)) {
    throw badRequest("caseAnchor must be one of case_start, case_end, period_month_start, period_month_end");
  }
  if (!Number.isInteger(input.caseOffsetDays) || input.caseOffsetDays < 0) {
    throw badRequest("caseOffsetDays must be a non-negative integer");
  }
}

function addDays(date: string, delta: number): string {
  const d = parseDateOnly(date);
  d.setUTCDate(d.getUTCDate() + delta);
  return formatDateOnly(d);
}

function firstDayOfMonth(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
}

function lastDayOfMonth(year: number, monthIndex0: number): string {
  return formatDateOnly(new Date(Date.UTC(year, monthIndex0 + 1, 0)));
}

function isWithinPeriod(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

// design.md 予定日計算 / Requirements 2.3, 6.1–6.3:
// - case_start: start + offset; case_end: end − offset
// - period_month_*: per calendar month in [start, end]'s months; period check
//   on the raw (pre-NBD) date; missing start or end → no dates
export function computeRawScheduledDates(
  anchor: CaseRelativeAnchor,
  offsetDays: number,
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): string[] {
  switch (anchor) {
    case "case_start": {
      if (startDate == null) return [];
      return [addDays(formatDateOnly(startDate), offsetDays)];
    }
    case "case_end": {
      if (endDate == null) return [];
      return [addDays(formatDateOnly(endDate), -offsetDays)];
    }
    case "period_month_start":
    case "period_month_end": {
      if (startDate == null || endDate == null) return [];
      const start = formatDateOnly(startDate);
      const end = formatDateOnly(endDate);
      const dates: string[] = [];
      let year = startDate.getUTCFullYear();
      let month = startDate.getUTCMonth();
      const endYear = endDate.getUTCFullYear();
      const endMonth = endDate.getUTCMonth();
      while (year < endYear || (year === endYear && month <= endMonth)) {
        const raw =
          anchor === "period_month_start"
            ? addDays(firstDayOfMonth(year, month), offsetDays)
            : addDays(lastDayOfMonth(year, month), -offsetDays);
        if (isWithinPeriod(raw, start, end)) {
          dates.push(raw);
        }
        month += 1;
        if (month > 11) {
          month = 0;
          year += 1;
        }
      }
      return dates;
    }
  }
}

// Requirements 5.7 / holidays policy: apply NBD after the raw period check.
// Returns null when policy=skip and the raw date is a non-business day.
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

function logInstanceGenerated(instance: Task, requestId: string): void {
  businessEventLogger.logBusinessEvent("recurring_task_instance.generated", {
    requestId,
    entityId: instance.id,
  });
}

// design.md tryCreateInstance pattern: TasksService.create with caseId,
// defaultMemo, sourceTemplateId, sourceAnchor, scheduledDate. Active unique
// collision → idempotent null.
async function tryCreateInstance(
  template: RecurringTaskTemplate,
  scheduledDate: Date,
  caseId: string,
): Promise<Task | null> {
  let result;
  try {
    result = await tasksService.create({
      title: template.title,
      priority: template.priority,
      memo: template.defaultMemo ?? undefined,
      caseId,
      sourceTemplateId: template.id,
      sourceAnchor: template.caseAnchor,
      scheduledDate,
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return null;
    }
    throw error;
  }
  if (!result.ok) {
    const message = result.error.type === "validation_error" ? result.error.message : result.error.type;
    throw new Error(`recurrence: failed to create task instance: ${message}`);
  }
  return result.value;
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

  // Requirement 2.7: isActive=true only; does not scan or backfill cases.
  async resumeTemplate(templateId: string): Promise<void> {
    try {
      await recurrenceRepository.resume(templateId);
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

  // Internal helper for task 3.2 applyToCase. Active templates with the
  // given caseAnchor only (Requirement 5.1). Period check on raw dates,
  // then NBD; skip → no instance (design.md 予定日計算).
  async generateForAnchor(
    caseEntity: Pick<Case, "id" | "startDate" | "endDate">,
    anchor: CaseRelativeAnchor,
    requestId: string = randomUUID(),
  ): Promise<Task[]> {
    const templates = (await recurrenceRepository.listActive()).filter((t) => t.caseAnchor === anchor);
    const created: Task[] = [];

    for (const template of templates) {
      const rawDates = computeRawScheduledDates(
        template.caseAnchor,
        template.caseOffsetDays,
        caseEntity.startDate,
        caseEntity.endDate,
      );
      for (const raw of rawDates) {
        const scheduledDate = await resolveScheduledDate(parseDateOnly(raw), template.nonBusinessDayPolicy);
        if (scheduledDate === null) continue;
        const instance = await tryCreateInstance(template, scheduledDate, caseEntity.id);
        if (instance) {
          created.push(instance);
          logInstanceGenerated(instance, requestId);
        }
      }
    }
    return created;
  },
};

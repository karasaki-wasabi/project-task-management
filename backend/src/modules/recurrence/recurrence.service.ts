// RecurrenceService: case-relative template management (task 2.1) +
// schedule calculation / generation helpers (task 2.2, design.md
// "予定日計算", Requirements 2.3, 5.1, 5.6–5.8, 6.1–6.3) +
// applyToCase (task 3.2, Requirements 3.2–3.4, 5.1–5.5).
//
// Task 4: CaseService passes a DbClient (interactive TX) through
// applyToCase → generateForAnchor / tryCreateInstance /
// deleteGeneratedForAnchors → tasksService.create|delete.
// workspace-resource-scope task 4.1: template CRUD takes VerifiedWorkspaceId;
// applyToCase filters templates by case.workspaceId.
import { randomUUID } from "node:crypto";
import type { Case } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { formatDateOnly, parseDateOnly } from "../../shared/date-only.js";
import { holidaysService } from "../holidays/holiday.service.js";
import { tasksService } from "../tasks/task.service.js";
import { isUniqueConstraintViolation, recurrenceRepository } from "./recurrence.repository.js";
import type {
  CaseRelativeAnchor,
  CaseTemplateApplyOperation,
  NonBusinessDayPolicy,
  RecurringTaskTemplate,
  RegisterTemplateInput,
  Task,
} from "./recurrence.types.js";

const MONTH_ANCHORS: CaseRelativeAnchor[] = ["period_month_start", "period_month_end"];

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
async function resolveScheduledDate(
  date: Date,
  policy: NonBusinessDayPolicy,
  workspaceId: VerifiedWorkspaceId,
): Promise<Date | null> {
  const dateStr = formatDateOnly(date);
  if (policy === "as_is") {
    return date;
  }
  if (await holidaysService.isBusinessDay(dateStr, workspaceId)) {
    return date;
  }
  switch (policy) {
    case "skip":
      return null;
    case "next_business_day":
      return parseDateOnly(await holidaysService.nextBusinessDay(dateStr, workspaceId));
    case "previous_business_day":
      return parseDateOnly(await holidaysService.previousBusinessDay(dateStr, workspaceId));
  }
}

function logInstanceGenerated(instance: Task, requestId: string): void {
  businessEventLogger.logBusinessEvent("recurring_task_instance.generated", {
    requestId,
    entityId: instance.id,
  });
}

// design.md tryCreateInstance pattern: TasksService.create with caseId,
// defaultDetail → detail, sourceTemplateId, sourceAnchor, scheduledEndDate.
// Active unique collision → idempotent null. Generated tasks inherit the case
// workspace (Requirement 1.3 / workspace-resource-scope 4.1).
async function tryCreateInstance(
  template: RecurringTaskTemplate,
  scheduledEndDate: Date,
  caseId: string,
  caseWorkspaceId: VerifiedWorkspaceId,
  client: DbClient,
): Promise<Task | null> {
  let result;
  try {
    result = await tasksService.create(
      {
        title: template.title,
        priority: template.priority,
        detail: template.defaultDetail ?? undefined,
        caseId,
        sourceTemplateId: template.id,
        sourceAnchor: template.caseAnchor,
        scheduledEndDate,
        workspaceId: caseWorkspaceId,
      },
      { type: "system", sourceLabel: "recurring_template" },
      client,
    );
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

// Requirements 5.2–5.5: delete by caseId + sourceAnchor (includes completed),
// exclude manual (null sourceAnchor), soft-delete via tasksService.delete.
// Template activity / existence does not affect delete targeting (5.3).
async function deleteGeneratedForAnchors(
  caseId: string,
  anchors: CaseRelativeAnchor[],
  requestId: string,
  client: DbClient,
): Promise<void> {
  const tasks = await client.task.findMany({
    where: { caseId, sourceAnchor: { in: anchors } },
  });
  for (const task of tasks) {
    const result = await tasksService.delete(
      task.id,
      task.workspaceId as VerifiedWorkspaceId,
      { type: "system", sourceLabel: "recurring_template" },
      requestId,
      client,
    );
    if (!result.ok && result.error.type !== "not_found") {
      throw new Error(`recurrence: failed to delete task instance: ${result.error.type}`);
    }
  }
}

export const recurrenceService = {
  async registerTemplate(input: RegisterTemplateInput): Promise<RecurringTaskTemplate> {
    validateRegisterInput(input);
    return recurrenceRepository.create({ ...input, title: input.title.trim() });
  },

  async stopTemplate(templateId: string, workspaceId: VerifiedWorkspaceId): Promise<void> {
    try {
      await recurrenceRepository.stop(templateId, workspaceId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Recurring task template not found: ${templateId}`);
      }
      throw error;
    }
  },

  // Requirement 2.7: isActive=true only; does not scan or backfill cases.
  async resumeTemplate(templateId: string, workspaceId: VerifiedWorkspaceId): Promise<void> {
    try {
      await recurrenceRepository.resume(templateId, workspaceId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Recurring task template not found: ${templateId}`);
      }
      throw error;
    }
  },

  async deleteTemplate(
    templateId: string,
    workspaceId: VerifiedWorkspaceId,
    requestId: string = randomUUID(),
  ): Promise<void> {
    try {
      await recurrenceRepository.remove(templateId, workspaceId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Recurring task template not found: ${templateId}`);
      }
      throw error;
    }
    businessEventLogger.logBusinessEvent("recurring_task_template.deleted", { requestId, entityId: templateId });
  },

  list(workspaceId: VerifiedWorkspaceId): Promise<RecurringTaskTemplate[]> {
    return recurrenceRepository.list(workspaceId);
  },

  // Internal helper for applyToCase. Active templates with the given
  // caseAnchor only (Requirement 5.1), limited to the case's workspace
  // (Requirement 1.3 / design.md recurrence applyToCase). Period check on
  // raw dates, then NBD; skip → no instance (design.md 予定日計算).
  async generateForAnchor(
    caseEntity: Pick<Case, "id" | "startDate" | "endDate" | "workspaceId">,
    anchor: CaseRelativeAnchor,
    requestId: string = randomUUID(),
    client: DbClient = db,
  ): Promise<Task[]> {
    const workspaceId = caseEntity.workspaceId as VerifiedWorkspaceId;
    const templates = (await recurrenceRepository.listActive(workspaceId)).filter((t) => t.caseAnchor === anchor);
    const created: Task[] = [];

    for (const template of templates) {
      const rawDates = computeRawScheduledDates(
        template.caseAnchor,
        template.caseOffsetDays,
        caseEntity.startDate,
        caseEntity.endDate,
      );
      for (const raw of rawDates) {
        const scheduledEndDate = await resolveScheduledDate(
          parseDateOnly(raw),
          template.nonBusinessDayPolicy,
          workspaceId,
        );
        if (scheduledEndDate === null) continue;
        const instance = await tryCreateInstance(template, scheduledEndDate, caseEntity.id, workspaceId, client);
        if (instance) {
          created.push(instance);
          logInstanceGenerated(instance, requestId);
        }
      }
    }
    return created;
  },

  /**
   * Execute selected template-apply operations for a case.
   * Called only from CaseService in the same TX (task 4); no public HTTP.
   * design.md CaseTemplateApplyOperation / Requirements 3.2–3.4, 5.1–5.5.
   */
  async applyToCase(
    caseId: string,
    operations: CaseTemplateApplyOperation[],
    requestId: string = randomUUID(),
    client: DbClient = db,
  ): Promise<void> {
    if (operations.length === 0) return;

    const caseEntity = await client.case.findUnique({ where: { id: caseId } });
    if (!caseEntity) {
      throw notFound(`Case not found: ${caseId}`);
    }

    for (const operation of operations) {
      switch (operation) {
        case "start_generate":
          await recurrenceService.generateForAnchor(caseEntity, "case_start", requestId, client);
          break;
        case "start_delete":
          await deleteGeneratedForAnchors(caseId, ["case_start"], requestId, client);
          break;
        case "start_regenerate":
          await deleteGeneratedForAnchors(caseId, ["case_start"], requestId, client);
          await recurrenceService.generateForAnchor(caseEntity, "case_start", requestId, client);
          break;
        case "end_generate":
          await recurrenceService.generateForAnchor(caseEntity, "case_end", requestId, client);
          break;
        case "end_delete":
          await deleteGeneratedForAnchors(caseId, ["case_end"], requestId, client);
          break;
        case "end_regenerate":
          await deleteGeneratedForAnchors(caseId, ["case_end"], requestId, client);
          await recurrenceService.generateForAnchor(caseEntity, "case_end", requestId, client);
          break;
        case "month_generate":
          await recurrenceService.generateForAnchor(caseEntity, "period_month_start", requestId, client);
          await recurrenceService.generateForAnchor(caseEntity, "period_month_end", requestId, client);
          break;
        case "month_delete":
          await deleteGeneratedForAnchors(caseId, MONTH_ANCHORS, requestId, client);
          break;
        case "month_regenerate":
          await deleteGeneratedForAnchors(caseId, MONTH_ANCHORS, requestId, client);
          await recurrenceService.generateForAnchor(caseEntity, "period_month_start", requestId, client);
          await recurrenceService.generateForAnchor(caseEntity, "period_month_end", requestId, client);
          break;
        default: {
          const _exhaustive: never = operation;
          throw badRequest(`Unknown template operation: ${_exhaustive}`);
        }
      }
    }
  },
};

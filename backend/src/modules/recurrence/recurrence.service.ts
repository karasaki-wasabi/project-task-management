// RecurrenceService: case-relative template management (task 2.1,
// design.md "RecurrenceService", Requirements 1.1, 1.2, 2.1, 2.2, 2.4–2.8).
// Instance generation helpers and applyToCase land in later tasks.
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import { recurrenceRepository } from "./recurrence.repository.js";
import type { RecurringTaskTemplate, RegisterTemplateInput } from "./recurrence.types.js";

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
};

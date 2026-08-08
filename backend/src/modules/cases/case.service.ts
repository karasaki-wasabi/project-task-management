// CaseService: creation/generic update/progress computation/deletion +
// RecurrenceService wiring + business event logging (design.md
// "Backend/cases" CaseService, renamed/extended from the former
// deliveries/delivery.service.ts, task 4.1/10.1/10.2, Requirements 2.3, 2.4,
// 2.5, 5.3, 5.4, 6.1, 6.2, 8.1, 8.2).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import { caseRepository } from "./case.repository.js";
import type { Case, CaseProgress, CreateCaseInput, UpdateCaseInput } from "./case.types.js";
// Task 2.1: removed unconfirmed RecurrenceService.onCaseCreated /
// onCaseEndDateChanged call sites. Explicit applyToCase via
// templateOperations lands in task 4.

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

// design.md CaseService Responsibilities & Constraints: startDate/endDate are
// both optional; the ordering check only applies when both are known
// (merged with the currently-persisted value on update) — if either is
// missing, the check is skipped entirely (Requirements 2.4, 2.5, 5.3, 5.4).
function validateDateRange(startDate: Date | null | undefined, endDate: Date | null | undefined): void {
  if (startDate == null || endDate == null) return;
  if (startDate.getTime() > endDate.getTime()) {
    throw badRequest("startDate must not be later than endDate");
  }
}

export const caseService = {
  async create(input: CreateCaseInput, requestId: string = randomUUID()): Promise<Case> {
    const name = input.name.trim();
    if (name.length === 0) {
      throw badRequest("name is required");
    }
    validateDateRange(input.startDate ?? null, input.endDate ?? null);

    // isCompleted is intentionally not part of CreateCaseInput (Requirement
    // 2.5): caseRepository.create() always lets the Prisma column default
    // (false) apply.
    const caseEntity = await caseRepository.create({ name, startDate: input.startDate, endDate: input.endDate });
    // Requirement 10.2: case creation is a broad-impact operation.
    businessEventLogger.logBusinessEvent("case.created", { requestId, entityId: caseEntity.id });
    // Task 2.1 stub: no unconfirmed template apply here. Task 4 wires
    // recurrenceService.applyToCase(templateOperations) in the same TX.
    return caseEntity;
  },

  async update(id: string, input: UpdateCaseInput): Promise<Case> {
    const current = await caseRepository.findById(id);
    if (!current) {
      throw notFound(`Case not found: ${id}`);
    }

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length === 0) {
        throw badRequest("name is required");
      }
    }

    // Merge whichever of startDate/endDate are provided with the
    // currently-persisted value to detect a resulting startDate > endDate
    // (Requirement 5.3), independent of which fields this call touches
    // (Requirement 5.1/5.4).
    const nextStartDate = input.startDate !== undefined ? input.startDate : current.startDate;
    const nextEndDate = input.endDate !== undefined ? input.endDate : current.endDate;
    validateDateRange(nextStartDate, nextEndDate);

    const data: Partial<{ name: string; startDate: Date | null; endDate: Date | null; isCompleted: boolean }> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.isCompleted !== undefined) data.isCompleted = input.isCompleted;

    let updated: Case;
    try {
      updated = await caseRepository.update(id, data);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Case not found: ${id}`);
      }
      throw error;
    }

    // Task 2.1 stub: no unconfirmed onCaseEndDateChanged / onCaseCreated.
    // Task 4 wires applyToCase(templateOperations) in the same TX.

    return updated;
  },

  async getProgress(id: string): Promise<CaseProgress> {
    const caseEntity = await caseRepository.findById(id);
    if (!caseEntity) {
      throw notFound(`Case not found: ${id}`);
    }

    const [requiredTotal, requiredCompleted] = await Promise.all([
      caseRepository.countRequiredTasks(id),
      caseRepository.countRequiredCompletedTasks(id),
    ]);
    const requiredIncomplete = requiredTotal - requiredCompleted;

    return {
      requiredTotal,
      requiredCompleted,
      requiredIncomplete,
      // Requirement 6.1/6.2/6.3: a manually-completed case is never
      // overdue, regardless of endDate or outstanding required tasks; a
      // case with no endDate at all has no basis for an overdue judgement
      // either (endDate is optional as of task 13.1) — this null check is a
      // direct consequence of that type change, not a preemption of task
      // 13.3's own equivalent test coverage.
      isOverdueWithIncomplete:
        !caseEntity.isCompleted &&
        caseEntity.endDate !== null &&
        caseEntity.endDate.getTime() < Date.now() &&
        requiredIncomplete > 0,
    };
  },

  async delete(id: string, requestId: string = randomUUID()): Promise<void> {
    try {
      await caseRepository.delete(id);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Case not found: ${id}`);
      }
      throw error;
    }
    businessEventLogger.logBusinessEvent("case.deleted", { requestId, entityId: id });
  },

  list(): Promise<Case[]> {
    return caseRepository.list();
  },
};

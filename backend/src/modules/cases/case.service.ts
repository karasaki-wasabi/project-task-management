// CaseService: creation/generic update/progress computation/deletion +
// RecurrenceService wiring + business event logging (design.md
// "Backend/cases" CaseService, renamed/extended from the former
// deliveries/delivery.service.ts, task 4.1/10.1/10.2, Requirements 2.3, 2.4,
// 2.5, 5.3, 5.4, 6.1, 6.2, 8.1, 8.2).
//
// Task 4: date save + template apply run in one Prisma TX. templateOperations
// omit = full candidates, [] = no apply, non-subset = 400 (Requirements
// 3.2–3.4, 3.6, 4.3, 4.13; design.md CaseService / Architecture Integration).
//
// workspace-resource-scope task 2.1: create/list/get/update/delete are scoped
// by VerifiedWorkspaceId; cross-workspace access yields notFound (404).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { recurrenceService } from "../recurrence/recurrence.service.js";
import { caseRepository } from "./case.repository.js";
import {
  buildCaseTemplateApplyCandidates,
  type CaseTemplateApplyOperation,
} from "./caseTemplateApplyCandidates.js";
import type { Case, CaseProgress, CreateCaseInput, UpdateCaseInput } from "./case.types.js";

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

/**
 * Resolve templateOperations per design.md templateOperations 導出の原則:
 * undefined → full candidates; [] → none; non-subset of candidates → 400.
 */
function resolveTemplateOperations(
  provided: CaseTemplateApplyOperation[] | undefined,
  oldStart: Date | null | undefined,
  oldEnd: Date | null | undefined,
  newStart: Date | null | undefined,
  newEnd: Date | null | undefined,
): CaseTemplateApplyOperation[] {
  const full = buildCaseTemplateApplyCandidates(oldStart, oldEnd, newStart, newEnd);
  if (provided === undefined) {
    return full;
  }
  const allowed = new Set(full);
  for (const op of provided) {
    if (!allowed.has(op)) {
      throw badRequest(`templateOperations must be a subset of apply candidates; invalid: ${op}`);
    }
  }
  return provided;
}

export const caseService = {
  async create(input: CreateCaseInput, requestId: string = randomUUID()): Promise<Case> {
    const name = input.name.trim();
    if (name.length === 0) {
      throw badRequest("name is required");
    }
    validateDateRange(input.startDate ?? null, input.endDate ?? null);

    const operations = resolveTemplateOperations(
      input.templateOperations,
      null,
      null,
      input.startDate ?? null,
      input.endDate ?? null,
    );

    // isCompleted is intentionally not part of CreateCaseInput (Requirement
    // 2.5): caseRepository.create() always lets the Prisma column default
    // (false) apply. Date write + apply share one TX (design.md CaseService).
    const caseEntity = await db.$transaction(async (tx) => {
      const created = await caseRepository.create(
        {
          name,
          startDate: input.startDate,
          endDate: input.endDate,
          workspaceId: input.workspaceId,
        },
        tx,
      );
      if (operations.length > 0) {
        await recurrenceService.applyToCase(created.id, operations, requestId, tx);
      }
      return created;
    });

    // Requirement 10.2: case creation is a broad-impact operation.
    // Log only after the TX commits so rolled-back creates are not logged.
    businessEventLogger.logBusinessEvent("case.created", { requestId, entityId: caseEntity.id });
    return caseEntity;
  },

  async update(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    input: UpdateCaseInput,
    requestId: string = randomUUID(),
  ): Promise<Case> {
    const current = await caseRepository.findById(id, workspaceId);
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

    const operations = resolveTemplateOperations(
      input.templateOperations,
      current.startDate,
      current.endDate,
      nextStartDate,
      nextEndDate,
    );

    const data: Partial<{ name: string; startDate: Date | null; endDate: Date | null; isCompleted: boolean }> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.isCompleted !== undefined) data.isCompleted = input.isCompleted;

    try {
      return await db.$transaction(async (tx) => {
        const updated = await caseRepository.update(id, workspaceId, data, tx);
        if (operations.length > 0) {
          await recurrenceService.applyToCase(id, operations, requestId, tx);
        }
        return updated;
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Case not found: ${id}`);
      }
      throw error;
    }
  },

  async getProgress(id: string, workspaceId: VerifiedWorkspaceId): Promise<CaseProgress> {
    const caseEntity = await caseRepository.findById(id, workspaceId);
    if (!caseEntity) {
      throw notFound(`Case not found: ${id}`);
    }

    const [requiredTotal, requiredCompleted] = await Promise.all([
      caseRepository.countRequiredTasks(id, workspaceId),
      caseRepository.countRequiredCompletedTasks(id, workspaceId),
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

  async delete(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    requestId: string = randomUUID(),
  ): Promise<void> {
    try {
      await caseRepository.delete(id, workspaceId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Case not found: ${id}`);
      }
      throw error;
    }
    businessEventLogger.logBusinessEvent("case.deleted", { requestId, entityId: id });
  },

  list(workspaceId: VerifiedWorkspaceId): Promise<Case[]> {
    return caseRepository.list(workspaceId);
  },
};

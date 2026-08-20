import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { recurrenceService } from "../recurrence/recurrence.service.js";
import { taskIntegrityService } from "../tasks/task-integrity.service.js";
import { caseRepository } from "./case.repository.js";
import {
  buildCaseTemplateApplyCandidates,
  type CaseTemplateApplyOperation,
} from "./caseTemplateApplyCandidates.js";
import type { Case, CaseProgress, CreateCaseInput, UpdateCaseInput } from "./case.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function validateDateRange(startDate: Date | null | undefined, endDate: Date | null | undefined): void {
  if (startDate == null || endDate == null) return;
  if (startDate.getTime() > endDate.getTime()) {
    throw badRequest("startDate must not be later than endDate");
  }
}

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

    const { requiredTotal, requiredCompleted } = await taskIntegrityService.countRequiredForCaseProgress(
      id,
      workspaceId,
    );
    const requiredIncomplete = requiredTotal - requiredCompleted;

    return {
      requiredTotal,
      requiredCompleted,
      requiredIncomplete,
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
    client?: DbClient,
  ): Promise<void> {
    const run = async (tx: DbClient) => {
      await taskIntegrityService.detachFromCase(id, tx);
      await caseRepository.delete(id, workspaceId, tx);
    };
    try {
      if (client) {
        await run(client);
      } else {
        await db.$transaction(run);
      }
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

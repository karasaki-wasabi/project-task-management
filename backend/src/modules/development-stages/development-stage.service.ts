// DevelopmentStagesService (task 14.1, design.md "Backend/development-stages",
// Requirements 12.1, 12.2, 12.5).
// workspace-resource-scope task 6.1: create/list/rename/reorder/delete/findById
// are scoped by VerifiedWorkspaceId; cross-workspace access yields 404.
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { developmentStageRepository } from "./development-stage.repository.js";
import type { DevelopmentStage } from "./development-stage.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function assertValidName(name: string): void {
  if (name.trim().length === 0) {
    throw badRequest("name is required");
  }
}

export const developmentStagesService = {
  async create(name: string, workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage> {
    assertValidName(name);
    const existing = await developmentStageRepository.list(workspaceId);
    // Use max(order)+1, not existing.length: a prior delete leaves a gap in
    // the order sequence (soft-deleted rows are excluded from `list()` but
    // their `order` value was already consumed), so counting live rows can
    // reassign an `order` that collides with a remaining stage.
    const nextOrder = Math.max(-1, ...existing.map((stage) => stage.order)) + 1;
    return developmentStageRepository.create(name, nextOrder, workspaceId);
  },

  async findById(id: string, workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage | null> {
    const row = await developmentStageRepository.findById(id, workspaceId);
    if (!row) return null;
    return { id: row.id, name: row.name, order: row.order, workspaceId: row.workspaceId };
  },

  async rename(id: string, workspaceId: VerifiedWorkspaceId, name: string): Promise<DevelopmentStage> {
    assertValidName(name);
    try {
      return await developmentStageRepository.rename(id, workspaceId, name);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Development stage not found: ${id}`);
      }
      throw error;
    }
  },

  // Preconditions (design.md): `orderedIds` must contain exactly the current
  // set of non-deleted development stages in the workspace, no more and no fewer.
  async reorder(orderedIds: string[], workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage[]> {
    const existing = await developmentStageRepository.list(workspaceId);
    const existingIds = new Set(existing.map((stage) => stage.id));
    const uniqueOrderedIds = new Set(orderedIds);
    const sameSize = existingIds.size === uniqueOrderedIds.size && uniqueOrderedIds.size === orderedIds.length;
    const sameMembers = orderedIds.every((id) => existingIds.has(id));
    if (!sameSize || !sameMembers) {
      throw badRequest("orderedIds must contain exactly the current set of development stages");
    }
    return developmentStageRepository.reorder(orderedIds, workspaceId);
  },

  async delete(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    requestId: string = randomUUID(),
  ): Promise<void> {
    try {
      await developmentStageRepository.delete(id, workspaceId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Development stage not found: ${id}`);
      }
      throw error;
    }
    businessEventLogger.logBusinessEvent("development_stage.deleted", { requestId, entityId: id });
  },

  list(workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage[]> {
    return developmentStageRepository.list(workspaceId);
  },
};

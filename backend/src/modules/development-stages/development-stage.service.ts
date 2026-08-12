// DevelopmentStagesService (task 14.1, design.md "Backend/development-stages",
// Requirements 12.1, 12.2, 12.5).
// workspace-resource-scope task 6.1: create/list/rename/reorder/delete/getById
// are scoped by VerifiedWorkspaceId; cross-workspace access yields 404.
// task-status-model 2.1: domain responses include kind; getById resolves a stage by id.
// task-status-model 2.2: create always assigns normal and inserts after normals;
// delete rejects terminal kinds; rename/reorder stay available (no kind-change path).
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

function isTerminalKind(kind: DevelopmentStage["kind"]): boolean {
  return kind === "completed" || kind === "cancelled";
}

export const developmentStagesService = {
  async create(name: string, workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage> {
    assertValidName(name);
    const existing = await developmentStageRepository.list(workspaceId);
    // Insert after the max order among normal stages (design.md Implementation
    // Notes). Using max(all orders)+1 would place new normals behind terminals.
    // Prefer max over counting live rows: soft-deleted orders leave gaps that
    // must not be reused for uniqueness collisions.
    const normalOrders = existing.filter((stage) => stage.kind === "normal").map((stage) => stage.order);
    const insertOrder = Math.max(-1, ...normalOrders) + 1;
    return developmentStageRepository.create(name, insertOrder, workspaceId);
  },

  getById(id: string, workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage | null> {
    return developmentStageRepository.findById(id, workspaceId);
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
    const existing = await developmentStageRepository.findById(id, workspaceId);
    if (!existing) {
      throw notFound(`Development stage not found: ${id}`);
    }
    if (isTerminalKind(existing.kind)) {
      throw badRequest("terminal development stages cannot be deleted");
    }
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

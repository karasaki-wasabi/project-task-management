import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { taskIntegrityService } from "../tasks/task-integrity.service.js";
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
    const normalOrders = existing.filter((stage) => stage.kind === "normal").map((stage) => stage.order);
    const insertOrder = Math.max(-1, ...normalOrders) + 1;
    return developmentStageRepository.create(name, insertOrder, workspaceId);
  },

  getById(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    client?: DbClient,
  ): Promise<DevelopmentStage | null> {
    return developmentStageRepository.findById(id, workspaceId, client);
  },

  async ensureTerminalStages(workspaceId: VerifiedWorkspaceId, client: DbClient): Promise<void> {
    await developmentStageRepository.createTerminalStages(workspaceId, client);
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
      await db.$transaction(async (tx) => {
        await taskIntegrityService.clearDevelopmentStage(id, tx);
        await developmentStageRepository.delete(id, workspaceId, tx);
      });
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

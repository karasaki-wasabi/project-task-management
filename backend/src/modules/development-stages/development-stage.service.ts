// DevelopmentStagesService (task 14.1, design.md "Backend/development-stages",
// Requirements 12.1, 12.2, 12.5).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { badRequest, notFound } from "../../shared/http-errors.js";
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
  async create(name: string): Promise<DevelopmentStage> {
    assertValidName(name);
    const existing = await developmentStageRepository.list();
    // Use max(order)+1, not existing.length: a prior delete leaves a gap in
    // the order sequence (soft-deleted rows are excluded from `list()` but
    // their `order` value was already consumed), so counting live rows can
    // reassign an `order` that collides with a remaining stage.
    const nextOrder = Math.max(-1, ...existing.map((stage) => stage.order)) + 1;
    return developmentStageRepository.create(name, nextOrder);
  },

  async rename(id: string, name: string): Promise<DevelopmentStage> {
    assertValidName(name);
    try {
      return await developmentStageRepository.rename(id, name);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Development stage not found: ${id}`);
      }
      throw error;
    }
  },

  // Preconditions (design.md): `orderedIds` must contain exactly the current
  // set of non-deleted development stages, no more and no fewer.
  async reorder(orderedIds: string[]): Promise<DevelopmentStage[]> {
    const existing = await developmentStageRepository.list();
    const existingIds = new Set(existing.map((stage) => stage.id));
    const uniqueOrderedIds = new Set(orderedIds);
    const sameSize = existingIds.size === uniqueOrderedIds.size && uniqueOrderedIds.size === orderedIds.length;
    const sameMembers = orderedIds.every((id) => existingIds.has(id));
    if (!sameSize || !sameMembers) {
      throw badRequest("orderedIds must contain exactly the current set of development stages");
    }
    return developmentStageRepository.reorder(orderedIds);
  },

  async delete(id: string, requestId: string = randomUUID()): Promise<void> {
    try {
      await developmentStageRepository.delete(id);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw notFound(`Development stage not found: ${id}`);
      }
      throw error;
    }
    businessEventLogger.logBusinessEvent("development_stage.deleted", { requestId, entityId: id });
  },

  list(): Promise<DevelopmentStage[]> {
    return developmentStageRepository.list();
  },
};

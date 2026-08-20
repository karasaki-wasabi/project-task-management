import type { DevelopmentStage as PrismaDevelopmentStage } from "@prisma/client";
import { db } from "../../shared/db.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import { withWorkspaceScope, type VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import type { DevelopmentStage } from "./development-stage.types.js";

function toDomain(row: PrismaDevelopmentStage): DevelopmentStage {
  return {
    id: row.id,
    name: row.name,
    order: row.order,
    kind: row.kind,
    workspaceId: row.workspaceId,
  };
}

export const developmentStageRepository = {
  async create(name: string, order: number, workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage> {
    return db.$transaction(async (tx) => {
      await tx.developmentStage.updateMany({
        where: withWorkspaceScope({ order: { gte: order } }, workspaceId),
        data: { order: { increment: 1 } },
      });
      const row = await tx.developmentStage.create({
        data: { name, order, kind: "normal", workspaceId },
      });
      return toDomain(row);
    });
  },

  async findById(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    client: DbClient = db,
  ): Promise<DevelopmentStage | null> {
    const row = await client.developmentStage.findFirst({
      where: withWorkspaceScope({ id }, workspaceId),
    });
    return row ? toDomain(row) : null;
  },

  createTerminalStages(workspaceId: VerifiedWorkspaceId, client: DbClient): Promise<{ count: number }> {
    return client.developmentStage.createMany({
      data: [
        { name: "完了", order: 0, kind: "completed", workspaceId },
        { name: "中止", order: 1, kind: "cancelled", workspaceId },
      ],
    });
  },

  async rename(id: string, workspaceId: VerifiedWorkspaceId, name: string): Promise<DevelopmentStage> {
    const row = await db.developmentStage.update({
      where: withWorkspaceScope({ id }, workspaceId),
      data: { name },
    });
    return toDomain(row);
  },

  async reorder(orderedIds: string[], workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage[]> {
    return db.$transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx.developmentStage.update({
          where: withWorkspaceScope({ id }, workspaceId),
          data: { order: index },
        });
      }
      const rows = await tx.developmentStage.findMany({
        where: withWorkspaceScope({}, workspaceId),
        orderBy: { order: "asc" },
      });
      return rows.map(toDomain);
    });
  },

  delete(id: string, workspaceId: VerifiedWorkspaceId, client: DbClient = db): Promise<PrismaDevelopmentStage> {
    return client.developmentStage.delete({ where: withWorkspaceScope({ id }, workspaceId) });
  },

  async list(workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage[]> {
    const rows = await db.developmentStage.findMany({
      where: withWorkspaceScope({}, workspaceId),
      orderBy: { order: "asc" },
    });
    return rows.map(toDomain);
  },
};

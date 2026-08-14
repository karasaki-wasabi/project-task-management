// Persistence for DevelopmentStages (task 14.1, design.md
// "Backend/development-stages"). Soft-delete / audit-column behavior comes
// from the shared `db` client (task 1.4).
// workspace-resource-scope task 6.1: all queries take VerifiedWorkspaceId and
// compose where via withWorkspaceScope.
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
  // Inserts at `order` and shifts later stages up by 1 so a new normal stage
  // can sit before terminal stages (task-status-model 2.2 / design.md).
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

  // Same payload as workspaceService.create terminal bootstrap (name/order/kind).
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

  // design.md Data Models "Consistency & Integrity": deleting a development
  // stage detaches (does not cascade-delete) linked Task records by nulling
  // their developmentStageId, matching the `deliveries` deletion pattern.
  delete(id: string, workspaceId: VerifiedWorkspaceId): Promise<PrismaDevelopmentStage> {
    return db.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { developmentStageId: id }, data: { developmentStageId: null } });
      return tx.developmentStage.delete({ where: withWorkspaceScope({ id }, workspaceId) });
    });
  },

  async list(workspaceId: VerifiedWorkspaceId): Promise<DevelopmentStage[]> {
    const rows = await db.developmentStage.findMany({
      where: withWorkspaceScope({}, workspaceId),
      orderBy: { order: "asc" },
    });
    return rows.map(toDomain);
  },
};

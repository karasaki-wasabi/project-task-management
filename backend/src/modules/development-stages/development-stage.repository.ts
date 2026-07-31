// Persistence for DevelopmentStages (task 14.1, design.md
// "Backend/development-stages"). Soft-delete / audit-column behavior comes
// from the shared `db` client (task 1.4).
import type { DevelopmentStage as PrismaDevelopmentStage } from "@prisma/client";
import { db } from "../../shared/db.js";
import type { DevelopmentStage } from "./development-stage.types.js";

function toDomain(row: PrismaDevelopmentStage): DevelopmentStage {
  return { id: row.id, name: row.name, order: row.order };
}

export const developmentStageRepository = {
  async create(name: string, order: number): Promise<DevelopmentStage> {
    const row = await db.developmentStage.create({ data: { name, order } });
    return toDomain(row);
  },

  async rename(id: string, name: string): Promise<DevelopmentStage> {
    const row = await db.developmentStage.update({ where: { id }, data: { name } });
    return toDomain(row);
  },

  async reorder(orderedIds: string[]): Promise<DevelopmentStage[]> {
    return db.$transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx.developmentStage.update({ where: { id }, data: { order: index } });
      }
      const rows = await tx.developmentStage.findMany({ orderBy: { order: "asc" } });
      return rows.map(toDomain);
    });
  },

  // design.md Data Models "Consistency & Integrity": deleting a development
  // stage detaches (does not cascade-delete) linked Task records by nulling
  // their developmentStageId, matching the `deliveries` deletion pattern.
  delete(id: string): Promise<PrismaDevelopmentStage> {
    return db.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { developmentStageId: id }, data: { developmentStageId: null } });
      return tx.developmentStage.delete({ where: { id } });
    });
  },

  async list(): Promise<DevelopmentStage[]> {
    const rows = await db.developmentStage.findMany({ orderBy: { order: "asc" } });
    return rows.map(toDomain);
  },
};

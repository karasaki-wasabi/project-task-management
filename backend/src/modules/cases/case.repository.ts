import { db } from "../../shared/db.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import { withWorkspaceScope, type VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import type { Case } from "./case.types.js";

export const caseRepository = {
  create(
    input: { name: string; startDate?: Date; endDate?: Date; workspaceId: VerifiedWorkspaceId },
    client: DbClient = db,
  ): Promise<Case> {
    return client.case.create({
      data: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        workspaceId: input.workspaceId,
      },
    });
  },

  findById(id: string, workspaceId: VerifiedWorkspaceId, client: DbClient = db): Promise<Case | null> {
    return client.case.findFirst({ where: withWorkspaceScope({ id }, workspaceId) });
  },

  update(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    data: Partial<{ name: string; startDate: Date | null; endDate: Date | null; isCompleted: boolean }>,
    client: DbClient = db,
  ): Promise<Case> {
    return client.case.update({ where: withWorkspaceScope({ id }, workspaceId), data });
  },

  list(workspaceId: VerifiedWorkspaceId, client: DbClient = db): Promise<Case[]> {
    return client.case.findMany({
      where: withWorkspaceScope({}, workspaceId),
      orderBy: { createdAt: "asc" },
    });
  },

  delete(id: string, workspaceId: VerifiedWorkspaceId, client: DbClient = db): Promise<Case> {
    return client.case.delete({ where: withWorkspaceScope({ id }, workspaceId) });
  },
};

// Persistence for Cases (task 3.1, design.md "Backend/cases"; renamed and
// extended from the former deliveries/delivery.repository.ts, task 4.1).
// Soft-delete / audit-column behavior comes from the shared `db` client
// (task 1.4). Optional DbClient lets CaseService run create/update in the
// same TX as template apply (task 4).
// workspace-resource-scope task 2.1: all queries take VerifiedWorkspaceId and
// compose where via withWorkspaceScope; list() honors the optional client.
import { db } from "../../shared/db.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import { withWorkspaceScope, type VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import type { Case } from "./case.types.js";

export const caseRepository = {
  create(
    input: { name: string; startDate?: Date; endDate?: Date; workspaceId: VerifiedWorkspaceId },
    client: DbClient = db,
  ): Promise<Case> {
    // isCompleted is intentionally not accepted here: design.md CaseService
    // Responsibilities & Constraints — it is always false on create and the
    // Prisma column default applies.
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

  // design.md Data Models "Consistency & Integrity": deleting a case
  // detaches (does not cascade-delete) linked Task records by nulling
  // their caseId, so a case deletion never destroys task history.
  delete(id: string, workspaceId: VerifiedWorkspaceId): Promise<Case> {
    return db.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { caseId: id }, data: { caseId: null } });
      return tx.case.delete({ where: withWorkspaceScope({ id }, workspaceId) });
    });
  },

  countRequiredTasks(caseId: string, workspaceId: VerifiedWorkspaceId): Promise<number> {
    return db.task.count({
      where: withWorkspaceScope({ caseId, isRequiredForCase: true }, workspaceId),
    });
  },

  countRequiredCompletedTasks(caseId: string, workspaceId: VerifiedWorkspaceId): Promise<number> {
    return db.task.count({
      where: withWorkspaceScope({ caseId, isRequiredForCase: true, status: "done" }, workspaceId),
    });
  },
};

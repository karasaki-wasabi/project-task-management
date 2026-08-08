// Persistence for Cases (task 3.1, design.md "Backend/cases"; renamed and
// extended from the former deliveries/delivery.repository.ts, task 4.1).
// Soft-delete / audit-column behavior comes from the shared `db` client
// (task 1.4). Optional DbClient lets CaseService run create/update in the
// same TX as template apply (task 4).
import { db } from "../../shared/db.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import type { Case } from "./case.types.js";

export const caseRepository = {
  create(
    input: { name: string; startDate?: Date; endDate?: Date },
    client: DbClient = db,
  ): Promise<Case> {
    // isCompleted is intentionally not accepted here: design.md CaseService
    // Responsibilities & Constraints — it is always false on create and the
    // Prisma column default applies.
    return client.case.create({ data: { name: input.name, startDate: input.startDate, endDate: input.endDate } });
  },

  findById(id: string, client: DbClient = db): Promise<Case | null> {
    return client.case.findUnique({ where: { id } });
  },

  update(
    id: string,
    data: Partial<{ name: string; startDate: Date | null; endDate: Date | null; isCompleted: boolean }>,
    client: DbClient = db,
  ): Promise<Case> {
    return client.case.update({ where: { id }, data });
  },

  list(): Promise<Case[]> {
    return db.case.findMany({ orderBy: { createdAt: "asc" } });
  },

  // design.md Data Models "Consistency & Integrity": deleting a case
  // detaches (does not cascade-delete) linked Task records by nulling
  // their caseId, so a case deletion never destroys task history.
  delete(id: string): Promise<Case> {
    return db.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { caseId: id }, data: { caseId: null } });
      return tx.case.delete({ where: { id } });
    });
  },

  countRequiredTasks(caseId: string): Promise<number> {
    return db.task.count({ where: { caseId, isRequiredForCase: true } });
  },

  countRequiredCompletedTasks(caseId: string): Promise<number> {
    return db.task.count({ where: { caseId, isRequiredForCase: true, status: "done" } });
  },
};

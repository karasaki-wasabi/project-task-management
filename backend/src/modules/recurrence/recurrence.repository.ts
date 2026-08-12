// Persistence for RecurringTaskTemplates (task 2.1 template CRUD, design.md
// "RecurrenceService"). Soft-delete / audit-column behavior and the
// default `deletedAt: null` filter come from the shared `db` client.
// workspace-resource-scope task 4.1: all queries take VerifiedWorkspaceId and
// compose where via withWorkspaceScope.
import { Prisma } from "@prisma/client";
import { db } from "../../shared/db.js";
import { withWorkspaceScope, type VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import type { RecurringTaskTemplate, RegisterTemplateInput } from "./recurrence.types.js";

export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const recurrenceRepository = {
  create(input: RegisterTemplateInput): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.create({
      data: {
        title: input.title,
        priority: input.priority,
        caseAnchor: input.caseAnchor,
        caseOffsetDays: input.caseOffsetDays,
        defaultDetail: input.defaultDetail,
        nonBusinessDayPolicy: input.nonBusinessDayPolicy,
        workspaceId: input.workspaceId,
      },
    });
  },

  findById(id: string, workspaceId: VerifiedWorkspaceId): Promise<RecurringTaskTemplate | null> {
    return db.recurringTaskTemplate.findFirst({ where: withWorkspaceScope({ id }, workspaceId) });
  },

  // `stop` (isActive=false) and `delete` (soft-delete via deletedAt) are
  // distinct business operations — stop keeps the template visible/listed
  // but excluded from future generation; delete removes it from listings.
  stop(id: string, workspaceId: VerifiedWorkspaceId): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.update({
      where: withWorkspaceScope({ id }, workspaceId),
      data: { isActive: false },
    });
  },

  // Requirement 2.7: resume flips isActive only — no case scan / backfill.
  resume(id: string, workspaceId: VerifiedWorkspaceId): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.update({
      where: withWorkspaceScope({ id }, workspaceId),
      data: { isActive: true },
    });
  },

  remove(id: string, workspaceId: VerifiedWorkspaceId): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.delete({ where: withWorkspaceScope({ id }, workspaceId) });
  },

  list(workspaceId: VerifiedWorkspaceId): Promise<RecurringTaskTemplate[]> {
    return db.recurringTaskTemplate.findMany({
      where: withWorkspaceScope({}, workspaceId),
      orderBy: { createdAt: "asc" },
    });
  },

  // Active templates eligible for future generation (task 2.2+), scoped to
  // the case's workspace for applyToCase (workspace-resource-scope 4.1).
  listActive(workspaceId: VerifiedWorkspaceId): Promise<RecurringTaskTemplate[]> {
    return db.recurringTaskTemplate.findMany({
      where: withWorkspaceScope({ isActive: true }, workspaceId),
    });
  },
};

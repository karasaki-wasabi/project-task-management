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

  stop(id: string, workspaceId: VerifiedWorkspaceId): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.update({
      where: withWorkspaceScope({ id }, workspaceId),
      data: { isActive: false },
    });
  },

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

  listActive(workspaceId: VerifiedWorkspaceId): Promise<RecurringTaskTemplate[]> {
    return db.recurringTaskTemplate.findMany({
      where: withWorkspaceScope({ isActive: true }, workspaceId),
    });
  },
};

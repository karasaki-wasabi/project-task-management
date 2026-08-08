// Persistence for RecurringTaskTemplates (task 2.1 template CRUD, design.md
// "RecurrenceService"). Soft-delete / audit-column behavior and the
// default `deletedAt: null` filter come from the shared `db` client.
import { Prisma } from "@prisma/client";
import { db } from "../../shared/db.js";
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
        defaultMemo: input.defaultMemo,
        nonBusinessDayPolicy: input.nonBusinessDayPolicy,
      },
    });
  },

  findById(id: string): Promise<RecurringTaskTemplate | null> {
    return db.recurringTaskTemplate.findUnique({ where: { id } });
  },

  // `stop` (isActive=false) and `delete` (soft-delete via deletedAt) are
  // distinct business operations — stop keeps the template visible/listed
  // but excluded from future generation; delete removes it from listings.
  stop(id: string): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.update({ where: { id }, data: { isActive: false } });
  },

  // Requirement 2.7: resume flips isActive only — no case scan / backfill.
  resume(id: string): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.update({ where: { id }, data: { isActive: true } });
  },

  remove(id: string): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.delete({ where: { id } });
  },

  list(): Promise<RecurringTaskTemplate[]> {
    return db.recurringTaskTemplate.findMany({ orderBy: { createdAt: "asc" } });
  },

  // Active templates eligible for future generation (task 2.2+).
  listActive(): Promise<RecurringTaskTemplate[]> {
    return db.recurringTaskTemplate.findMany({ where: { isActive: true } });
  },
};

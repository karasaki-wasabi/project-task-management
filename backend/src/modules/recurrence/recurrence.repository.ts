// Persistence for RecurringTaskTemplates and their generated Task instances
// (task 9.1 template CRUD + task 9.2 instance generation, design.md
// "Backend/recurrence"). Soft-delete / audit-column behavior and the
// default `deletedAt: null` filter come from the shared `db` client
// (task 1.4).
import { Prisma } from "@prisma/client";
import { db } from "../../shared/db.js";
import type { RecurringTaskTemplate, RegisterTemplateInput, Task } from "./recurrence.types.js";

export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const recurrenceRepository = {
  create(input: RegisterTemplateInput): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.create({
      data: {
        title: input.title,
        priority: input.priority,
        kind: input.kind,
        intervalUnit: input.intervalUnit,
        intervalValue: input.intervalValue,
        boundDeliveryId: input.boundDeliveryId,
        deliveryOffsetDays: input.deliveryOffsetDays,
        defaultMemo: input.defaultMemo,
        nonBusinessDayPolicy: input.nonBusinessDayPolicy,
      },
    });
  },

  findById(id: string): Promise<RecurringTaskTemplate | null> {
    return db.recurringTaskTemplate.findUnique({ where: { id } });
  },

  // `stop` (isActive=false) and `delete` (soft-delete via deletedAt) are
  // distinct business operations (design.md Postconditions) — stop keeps
  // the template visible/listed but excluded from future generation;
  // delete removes it from listings entirely.
  stop(id: string): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.update({ where: { id }, data: { isActive: false } });
  },

  remove(id: string): Promise<RecurringTaskTemplate> {
    return db.recurringTaskTemplate.delete({ where: { id } });
  },

  list(): Promise<RecurringTaskTemplate[]> {
    return db.recurringTaskTemplate.findMany({ orderBy: { createdAt: "asc" } });
  },

  listActiveByKind(kind: RecurringTaskTemplate["kind"]): Promise<RecurringTaskTemplate[]> {
    return db.recurringTaskTemplate.findMany({ where: { kind, isActive: true } });
  },

  // Idempotent by construction: relies on the `(source_template_id,
  // scheduled_date)` unique constraint (task 1.3) to reject a duplicate
  // occurrence. Callers catch `isUniqueConstraintViolation` and treat it as
  // "already generated" rather than an error.
  createInstance(params: {
    template: RecurringTaskTemplate;
    scheduledDate: Date;
    deliveryId?: string;
  }): Promise<Task> {
    return db.task.create({
      data: {
        title: params.template.title,
        priority: params.template.priority,
        memo: params.template.defaultMemo,
        deliveryId: params.deliveryId,
        sourceTemplateId: params.template.id,
        scheduledDate: params.scheduledDate,
      },
    });
  },

  // The one not-yet-completed instance a delivery_relative template has
  // generated for a given delivery, if any (used by onDeliveryDueDateChanged
  // to recompute its scheduled date rather than create a duplicate).
  findIncompleteInstance(templateId: string, deliveryId: string): Promise<Task | null> {
    return db.task.findFirst({
      where: { sourceTemplateId: templateId, deliveryId, status: { not: "done" } },
    });
  },

  updateInstanceScheduledDate(taskId: string, scheduledDate: Date): Promise<Task> {
    return db.task.update({ where: { id: taskId }, data: { scheduledDate } });
  },
};

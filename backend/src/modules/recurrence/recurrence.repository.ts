// Persistence for RecurringTaskTemplates (task 9.1, design.md
// "Backend/recurrence"). Soft-delete / audit-column behavior and the
// default `deletedAt: null` filter come from the shared `db` client
// (task 1.4).
import { db } from "../../shared/db.js";
import type { RecurringTaskTemplate, RegisterTemplateInput } from "./recurrence.types.js";

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
};

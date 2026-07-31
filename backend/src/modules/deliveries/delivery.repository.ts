// Persistence for Deliveries (task 4.1, design.md "Backend/deliveries").
// Soft-delete / audit-column behavior comes from the shared `db` client
// (task 1.4). RecurrenceService notification (design.md System Flows) is
// explicitly out of scope for this task; that wiring is added in task 10.1.
import { db } from "../../shared/db.js";
import type { CreateDeliveryInput, Delivery } from "./delivery.types.js";

export const deliveryRepository = {
  create(input: CreateDeliveryInput): Promise<Delivery> {
    return db.delivery.create({ data: { name: input.name, dueDate: input.dueDate } });
  },

  findById(id: string): Promise<Delivery | null> {
    return db.delivery.findUnique({ where: { id } });
  },

  updateDueDate(id: string, dueDate: Date): Promise<Delivery> {
    return db.delivery.update({ where: { id }, data: { dueDate } });
  },

  list(): Promise<Delivery[]> {
    return db.delivery.findMany({ orderBy: { createdAt: "asc" } });
  },

  // design.md Data Models "Consistency & Integrity": deleting a delivery
  // detaches (does not cascade-delete) linked Task/Event records by nulling
  // their deliveryId, so a delivery deletion never destroys task history.
  delete(id: string): Promise<Delivery> {
    return db.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { deliveryId: id }, data: { deliveryId: null } });
      await tx.event.updateMany({ where: { deliveryId: id }, data: { deliveryId: null } });
      return tx.delivery.delete({ where: { id } });
    });
  },

  countRequiredTasks(deliveryId: string): Promise<number> {
    return db.task.count({ where: { deliveryId, isRequiredForDelivery: true } });
  },

  countRequiredCompletedTasks(deliveryId: string): Promise<number> {
    return db.task.count({ where: { deliveryId, isRequiredForDelivery: true, status: "done" } });
  },
};

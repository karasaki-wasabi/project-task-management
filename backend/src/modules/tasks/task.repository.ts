// Persistence for Tasks (task 3.1, design.md "Backend/tasks"). Soft-delete /
// audit-column behavior and the default `deletedAt: null` list filter come
// from the shared `db` client (task 1.4).
import { db } from "../../shared/db.js";
import type { CreateTaskInput, Task, TaskListFilter, TaskStatus } from "./task.types.js";

export const taskRepository = {
  create(input: CreateTaskInput): Promise<Task> {
    return db.task.create({
      data: {
        title: input.title,
        priority: input.priority,
        memo: input.memo,
        deliveryId: input.deliveryId,
        // design.md TasksService Implementation Notes: "deliveryId未指定時は
        // isRequiredForDeliveryをfalse固定にする".
        isRequiredForDelivery: input.deliveryId ? (input.isRequiredForDelivery ?? false) : false,
        assigneeUserId: input.assigneeUserId,
        parentTaskId: input.parentTaskId,
      },
    });
  },

  findById(id: string): Promise<Task | null> {
    return db.task.findUnique({ where: { id } });
  },

  updateStatus(id: string, status: TaskStatus, completedAt: Date | null): Promise<Task> {
    return db.task.update({ where: { id }, data: { status, completedAt } });
  },

  delete(id: string): Promise<Task> {
    return db.task.delete({ where: { id } });
  },

  list(filter: TaskListFilter): Promise<Task[]> {
    return db.task.findMany({
      where: {
        deliveryId: filter.deliveryId,
        assigneeUserId: filter.assigneeUserId,
      },
      orderBy: { createdAt: "asc" },
    });
  },
};

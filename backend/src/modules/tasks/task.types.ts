// Task domain types (task 3.1, design.md "Backend/tasks" Service Interface).
// `addChild`/`splitTask` and their hierarchy-specific validation land in
// task 3.2; `parentTaskId` is already part of the shared CreateTaskInput
// shape per design.md so this task accepts it (and lets Prisma's FK
// constraint reject a non-existent parent) without implementing hierarchy
// business rules yet.
import type { Task as PrismaTask } from "@prisma/client";

export type { Task } from "@prisma/client";
export type TaskStatus = PrismaTask["status"];
export type Priority = PrismaTask["priority"];

export interface CreateTaskInput {
  title: string;
  priority: Priority;
  memo?: string;
  deliveryId?: string;
  isRequiredForDelivery?: boolean;
  assigneeUserId?: string;
  parentTaskId?: string;
}

export interface TaskListFilter {
  deliveryId?: string;
  assigneeUserId?: string;
}

export type TaskError =
  | { type: "not_found"; taskId: string }
  | { type: "incomplete_children"; taskId: string }
  | { type: "validation_error"; message: string };

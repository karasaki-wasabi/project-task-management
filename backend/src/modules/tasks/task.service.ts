// TasksService core (task 3.1, design.md "Backend/tasks", Requirements 1.1-
// 1.6, 7.2, 9.1-9.4). `addChild`/`splitTask` and hierarchy business rules
// (e.g. rejecting completion with incomplete children) land in task 3.2.
import { Prisma } from "@prisma/client";
import { err, ok, type Result } from "../../shared/result.js";
import { taskRepository } from "./task.repository.js";
import type { CreateTaskInput, Task, TaskError, TaskListFilter, TaskStatus } from "./task.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

export const tasksService = {
  async create(input: CreateTaskInput): Promise<Result<Task, TaskError>> {
    const title = input.title.trim();
    if (title.length === 0) {
      return err({ type: "validation_error", message: "title is required" });
    }

    try {
      const task = await taskRepository.create({ ...input, title });
      return ok(task);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return err({ type: "validation_error", message: "deliveryId, assigneeUserId, or parentTaskId does not exist" });
      }
      throw error;
    }
  },

  async updateStatus(taskId: string, status: TaskStatus): Promise<Result<Task, TaskError>> {
    const completedAt = status === "done" ? new Date() : null;
    try {
      const task = await taskRepository.updateStatus(taskId, status, completedAt);
      return ok(task);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return err({ type: "not_found", taskId });
      }
      throw error;
    }
  },

  async delete(taskId: string): Promise<Result<void, TaskError>> {
    try {
      await taskRepository.delete(taskId);
      return ok(undefined);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return err({ type: "not_found", taskId });
      }
      throw error;
    }
  },

  list(filter: TaskListFilter): Promise<Task[]> {
    return taskRepository.list(filter);
  },
};

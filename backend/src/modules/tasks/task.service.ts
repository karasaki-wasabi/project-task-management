// TasksService (task 3.1 core + task 3.2 hierarchy/split + task 10.2
// business event logging, design.md "Backend/tasks", Requirements 1.1-1.6,
// 2.1-2.4, 7.2, 9.1-9.4, 10.2).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { err, ok, type Result } from "../../shared/result.js";
import { taskRepository } from "./task.repository.js";
import type { CreateTaskInput, Task, TaskError, TaskListFilter, TaskStatus, UpdateTaskInput } from "./task.types.js";

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

  async getById(taskId: string): Promise<Result<Task, TaskError>> {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      return err({ type: "not_found", taskId });
    }
    return ok(task);
  },

  async updateStatus(taskId: string, status: TaskStatus): Promise<Result<Task, TaskError>> {
    if (status === "done") {
      const incompleteChildren = await taskRepository.countIncompleteChildren(taskId);
      if (incompleteChildren > 0) {
        return err({ type: "incomplete_children", taskId });
      }
    }

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

  // design.md TasksService Postconditions: developmentStageId is always
  // updated; assigneeUserId (from the request) is only applied when the
  // task's current assigneeUserId is null, so a kanban card move never
  // overwrites an already-assigned task's assignee (Requirements 12.6-12.8).
  // Enforced here rather than trusted from the client.
  async updateDevelopmentStage(
    taskId: string,
    developmentStageId: string | null,
    assigneeUserId?: string,
  ): Promise<Result<Task, TaskError>> {
    const current = await taskRepository.findById(taskId);
    if (!current) {
      return err({ type: "not_found", taskId });
    }

    const data: { developmentStageId: string | null; assigneeUserId?: string } = { developmentStageId };
    if (assigneeUserId && current.assigneeUserId === null) {
      data.assigneeUserId = assigneeUserId;
    }

    try {
      const task = await taskRepository.updateDevelopmentStage(taskId, data);
      return ok(task);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return err({ type: "not_found", taskId });
      }
      if (isForeignKeyViolation(error)) {
        return err({ type: "validation_error", message: "developmentStageId or assigneeUserId does not exist" });
      }
      throw error;
    }
  },

  // General field edit (title/priority/memo/deliveryId/isRequiredForDelivery/
  // assigneeUserId), distinct from the kanban-move-specific
  // updateDevelopmentStage above: an explicit edit always overwrites
  // assigneeUserId, it doesn't defer to "only if currently unassigned".
  async update(taskId: string, input: UpdateTaskInput): Promise<Result<Task, TaskError>> {
    const current = await taskRepository.findById(taskId);
    if (!current) {
      return err({ type: "not_found", taskId });
    }

    const data: UpdateTaskInput = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (title.length === 0) {
        return err({ type: "validation_error", message: "title is required" });
      }
      data.title = title;
    }
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.memo !== undefined) data.memo = input.memo;
    if (input.assigneeUserId !== undefined) data.assigneeUserId = input.assigneeUserId;

    // design.md TasksService Implementation Notes: "deliveryId未指定時は
    // isRequiredForDeliveryをfalse固定にする" — applied here on the merged
    // (post-update) deliveryId, same rule as create.
    if (input.deliveryId !== undefined) {
      data.deliveryId = input.deliveryId;
      data.isRequiredForDelivery = input.deliveryId === null ? false : (input.isRequiredForDelivery ?? current.isRequiredForDelivery);
    } else if (input.isRequiredForDelivery !== undefined) {
      if (current.deliveryId === null) {
        return err({ type: "validation_error", message: "isRequiredForDelivery requires a deliveryId" });
      }
      data.isRequiredForDelivery = input.isRequiredForDelivery;
    }

    try {
      const task = await taskRepository.update(taskId, data);
      return ok(task);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return err({ type: "not_found", taskId });
      }
      if (isForeignKeyViolation(error)) {
        return err({ type: "validation_error", message: "deliveryId or assigneeUserId does not exist" });
      }
      throw error;
    }
  },

  async addChild(parentTaskId: string, input: CreateTaskInput): Promise<Result<Task, TaskError>> {
    const parent = await taskRepository.findById(parentTaskId);
    if (!parent) {
      return err({ type: "not_found", taskId: parentTaskId });
    }

    const title = input.title.trim();
    if (title.length === 0) {
      return err({ type: "validation_error", message: "title is required" });
    }

    try {
      const child = await taskRepository.create({ ...input, title, parentTaskId });
      return ok(child);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return err({ type: "validation_error", message: "deliveryId or assigneeUserId does not exist" });
      }
      throw error;
    }
  },

  async splitTask(taskId: string, parts: CreateTaskInput[]): Promise<Result<Task[], TaskError>> {
    if (parts.length < 2) {
      return err({ type: "validation_error", message: "splitTask requires at least 2 parts" });
    }
    for (const part of parts) {
      if (part.title.trim().length === 0) {
        return err({ type: "validation_error", message: "title is required for every part" });
      }
    }

    const original = await taskRepository.findById(taskId);
    if (!original) {
      return err({ type: "not_found", taskId });
    }

    // design.md TasksService Postconditions: parts inherit the original
    // task's delivery link and priority, become its children.
    const inheritedParts = parts.map((part) => ({
      ...part,
      title: part.title.trim(),
      deliveryId: original.deliveryId ?? undefined,
      priority: original.priority,
      parentTaskId: taskId,
    }));

    try {
      const created = await taskRepository.createMany(inheritedParts);
      return ok(created);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return err({ type: "validation_error", message: "assigneeUserId does not exist" });
      }
      throw error;
    }
  },

  async delete(taskId: string, requestId: string = randomUUID()): Promise<Result<void, TaskError>> {
    try {
      await taskRepository.delete(taskId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return err({ type: "not_found", taskId });
      }
      throw error;
    }
    businessEventLogger.logBusinessEvent("task.deleted", { requestId, entityId: taskId });
    return ok(undefined);
  },

  list(filter: TaskListFilter): Promise<Task[]> {
    return taskRepository.list(filter);
  },
};

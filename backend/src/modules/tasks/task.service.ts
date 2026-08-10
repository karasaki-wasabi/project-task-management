// TasksService (task 3.1 core + task 3.2 hierarchy/split + task 10.2
// business event logging, design.md "Backend/tasks", Requirements 1.1-1.6,
// 2.1-2.4, 7.2, 9.1-9.4, 10.2).
// workspace-resource-scope task 3.1: create/list/get/update/delete are scoped
// by VerifiedWorkspaceId; cross-workspace access yields not_found (404).
// workspace-resource-scope task 3.2: assigneeUserId must be a current workspace
// member (Requirement 4.2); non-members yield validation_error → 400.
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { err, ok, type Result } from "../../shared/result.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { workspaceService } from "../workspaces/workspace.service.js";
import { taskRepository } from "./task.repository.js";
import type { CreateTaskInput, Task, TaskError, TaskListFilter, TaskStatus, UpdateTaskInput } from "./task.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

async function assertAssigneeIsWorkspaceMember(
  workspaceId: VerifiedWorkspaceId,
  assigneeUserId: string | null | undefined,
): Promise<Result<void, TaskError>> {
  if (assigneeUserId == null) {
    return ok(undefined);
  }
  const isMember = await workspaceService.isMember(workspaceId, assigneeUserId);
  if (!isMember) {
    return err({
      type: "validation_error",
      message: "assigneeUserId must be a member of the current workspace",
    });
  }
  return ok(undefined);
}

export const tasksService = {
  async create(input: CreateTaskInput, client: DbClient = db): Promise<Result<Task, TaskError>> {
    const title = input.title.trim();
    if (title.length === 0) {
      return err({ type: "validation_error", message: "title is required" });
    }

    const assigneeCheck = await assertAssigneeIsWorkspaceMember(input.workspaceId, input.assigneeUserId);
    if (!assigneeCheck.ok) {
      return assigneeCheck;
    }

    try {
      const task = await taskRepository.create({ ...input, title }, client);
      return ok(task);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return err({ type: "validation_error", message: "caseId, assigneeUserId, or parentTaskId does not exist" });
      }
      throw error;
    }
  },

  async getById(taskId: string, workspaceId: VerifiedWorkspaceId): Promise<Result<Task, TaskError>> {
    const task = await taskRepository.findById(taskId, workspaceId);
    if (!task) {
      return err({ type: "not_found", taskId });
    }
    return ok(task);
  },

  async updateStatus(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    status: TaskStatus,
  ): Promise<Result<Task, TaskError>> {
    const current = await taskRepository.findById(taskId, workspaceId);
    if (!current) {
      return err({ type: "not_found", taskId });
    }

    if (status === "done") {
      const incompleteChildren = await taskRepository.countIncompleteChildren(taskId);
      if (incompleteChildren > 0) {
        return err({ type: "incomplete_children", taskId });
      }
    }

    const completedAt = status === "done" ? new Date() : null;
    try {
      const task = await taskRepository.updateStatus(taskId, workspaceId, status, completedAt);
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
    workspaceId: VerifiedWorkspaceId,
    developmentStageId: string | null,
    assigneeUserId?: string,
  ): Promise<Result<Task, TaskError>> {
    const current = await taskRepository.findById(taskId, workspaceId);
    if (!current) {
      return err({ type: "not_found", taskId });
    }

    const data: { developmentStageId: string | null; assigneeUserId?: string } = { developmentStageId };
    if (assigneeUserId && current.assigneeUserId === null) {
      const assigneeCheck = await assertAssigneeIsWorkspaceMember(workspaceId, assigneeUserId);
      if (!assigneeCheck.ok) {
        return assigneeCheck;
      }
      data.assigneeUserId = assigneeUserId;
    }

    try {
      const task = await taskRepository.updateDevelopmentStage(taskId, workspaceId, data);
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

  // General field edit (title/priority/memo/caseId/isRequiredForCase/
  // assigneeUserId), distinct from the kanban-move-specific
  // updateDevelopmentStage above: an explicit edit always overwrites
  // assigneeUserId, it doesn't defer to "only if currently unassigned".
  async update(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    input: UpdateTaskInput,
  ): Promise<Result<Task, TaskError>> {
    const current = await taskRepository.findById(taskId, workspaceId);
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
    if (input.assigneeUserId !== undefined) {
      const assigneeCheck = await assertAssigneeIsWorkspaceMember(workspaceId, input.assigneeUserId);
      if (!assigneeCheck.ok) {
        return assigneeCheck;
      }
      data.assigneeUserId = input.assigneeUserId;
    }

    // design.md TasksService Implementation Notes: "caseId未指定時は
    // isRequiredForCaseをfalse固定にする" — applied here on the merged
    // (post-update) caseId, same rule as create.
    if (input.caseId !== undefined) {
      data.caseId = input.caseId;
      data.isRequiredForCase = input.caseId === null ? false : (input.isRequiredForCase ?? current.isRequiredForCase);
    } else if (input.isRequiredForCase !== undefined) {
      if (current.caseId === null) {
        return err({ type: "validation_error", message: "isRequiredForCase requires a caseId" });
      }
      data.isRequiredForCase = input.isRequiredForCase;
    }

    try {
      const task = await taskRepository.update(taskId, workspaceId, data);
      return ok(task);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return err({ type: "not_found", taskId });
      }
      if (isForeignKeyViolation(error)) {
        return err({ type: "validation_error", message: "caseId or assigneeUserId does not exist" });
      }
      throw error;
    }
  },

  async addChild(
    parentTaskId: string,
    workspaceId: VerifiedWorkspaceId,
    input: CreateTaskInput,
  ): Promise<Result<Task, TaskError>> {
    const parent = await taskRepository.findById(parentTaskId, workspaceId);
    if (!parent) {
      return err({ type: "not_found", taskId: parentTaskId });
    }

    const title = input.title.trim();
    if (title.length === 0) {
      return err({ type: "validation_error", message: "title is required" });
    }

    const assigneeCheck = await assertAssigneeIsWorkspaceMember(workspaceId, input.assigneeUserId);
    if (!assigneeCheck.ok) {
      return assigneeCheck;
    }

    try {
      const child = await taskRepository.create({ ...input, title, parentTaskId, workspaceId });
      return ok(child);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return err({ type: "validation_error", message: "caseId or assigneeUserId does not exist" });
      }
      throw error;
    }
  },

  async splitTask(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    parts: CreateTaskInput[],
  ): Promise<Result<Task[], TaskError>> {
    if (parts.length < 2) {
      return err({ type: "validation_error", message: "splitTask requires at least 2 parts" });
    }
    for (const part of parts) {
      if (part.title.trim().length === 0) {
        return err({ type: "validation_error", message: "title is required for every part" });
      }
    }

    const original = await taskRepository.findById(taskId, workspaceId);
    if (!original) {
      return err({ type: "not_found", taskId });
    }

    for (const part of parts) {
      const assigneeCheck = await assertAssigneeIsWorkspaceMember(workspaceId, part.assigneeUserId);
      if (!assigneeCheck.ok) {
        return assigneeCheck;
      }
    }

    // design.md TasksService Postconditions: parts inherit the original
    // task's case link and priority, become its children.
    const inheritedParts = parts.map((part) => ({
      ...part,
      title: part.title.trim(),
      caseId: original.caseId ?? undefined,
      priority: original.priority,
      parentTaskId: taskId,
      workspaceId,
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

  async delete(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    requestId: string = randomUUID(),
    client: DbClient = db,
  ): Promise<Result<void, TaskError>> {
    try {
      await taskRepository.delete(taskId, workspaceId, client);
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

// TasksService (task 3.1 core + task 3.2 hierarchy/split + task 10.2
// business event logging, design.md "Backend/tasks", Requirements 1.1-1.6,
// 2.1-2.4, 7.2, 9.1-9.4, 10.2).
// workspace-resource-scope task 3.1: create/list/get/update/delete are scoped
// by VerifiedWorkspaceId; cross-workspace access yields not_found (404).
// workspace-resource-scope task 3.2: assigneeUserId must be a current workspace
// member (Requirement 4.2); non-members yield validation_error → 400.
// workspace-resource-scope task 3.3: caseId / parentTaskId / developmentStageId
// must resolve in the current workspace (Requirement 3.5); missing or
// cross-workspace related IDs yield validation_error → 400 (same style as
// assignee validation; FK alone cannot enforce workspace co-location).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { err, ok, type Result } from "../../shared/result.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import { withWorkspaceScope, type VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { caseRepository } from "../cases/case.repository.js";
import { developmentStagesService } from "../development-stages/development-stage.service.js";
import type { DevelopmentStageKind } from "../development-stages/development-stage.types.js";
import { workspaceService } from "../workspaces/workspace.service.js";
import { resolveClosureState } from "./task.closure.js";
import { taskRepository } from "./task.repository.js";
import type { CreateTaskInput, Task, TaskError, TaskListFilter, TaskStatus, UpdateTaskInput } from "./task.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

// task-status-model 3.3: closed parents cannot receive open children (5.5, 5.6).
async function assertParentCanTakeOpenChildren(
  parent: Task,
  workspaceId: VerifiedWorkspaceId,
): Promise<Result<void, TaskError>> {
  let kind: DevelopmentStageKind | null = null;
  if (parent.developmentStageId != null) {
    const stage = await developmentStagesService.getById(parent.developmentStageId, workspaceId);
    kind = stage?.kind ?? null;
  }
  if (resolveClosureState(kind) !== "open") {
    return err({ type: "closed_task_cannot_take_children", taskId: parent.id });
  }
  return ok(undefined);
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

async function assertRelatedResourcesInWorkspace(
  workspaceId: VerifiedWorkspaceId,
  refs: {
    caseId?: string | null;
    parentTaskId?: string | null;
    developmentStageId?: string | null;
  },
  client: DbClient = db,
): Promise<Result<void, TaskError>> {
  if (refs.caseId != null) {
    // Must use the same DbClient as the caller: caseService.create runs
    // applyToCase inside an interactive TX, so an uncommitted case is only
    // visible on that TX client (not the global `db`).
    const caseRecord = await caseRepository.findById(refs.caseId, workspaceId, client);
    if (!caseRecord) {
      return err({
        type: "validation_error",
        message: "caseId does not exist in the current workspace",
      });
    }
  }
  if (refs.parentTaskId != null) {
    const parent = await taskRepository.findById(refs.parentTaskId, workspaceId, client);
    if (!parent) {
      return err({
        type: "validation_error",
        message: "parentTaskId does not exist in the current workspace",
      });
    }
  }
  if (refs.developmentStageId != null) {
    const stage = await client.developmentStage.findFirst({
      where: withWorkspaceScope({ id: refs.developmentStageId }, workspaceId),
    });
    if (!stage) {
      return err({
        type: "validation_error",
        message: "developmentStageId does not exist in the current workspace",
      });
    }
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

    const relatedCheck = await assertRelatedResourcesInWorkspace(
      input.workspaceId,
      {
        caseId: input.caseId,
        parentTaskId: input.parentTaskId,
      },
      client,
    );
    if (!relatedCheck.ok) {
      return relatedCheck;
    }

    if (input.parentTaskId != null) {
      const parent = await taskRepository.findById(input.parentTaskId, input.workspaceId, client);
      if (!parent) {
        return err({
          type: "validation_error",
          message: "parentTaskId does not exist in the current workspace",
        });
      }
      const closedParentCheck = await assertParentCanTakeOpenChildren(parent, input.workspaceId);
      if (!closedParentCheck.ok) {
        return closedParentCheck;
      }
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

  // task-status-model 3.2: status is stage-internal work state only.
  // Does not stamp/clear completedAt or enforce parent/child constraints (2.4, 4.2).
  // Rejects edits while the task sits on a terminal stage (4.5).
  async updateStatus(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    status: TaskStatus,
  ): Promise<Result<Task, TaskError>> {
    const current = await taskRepository.findById(taskId, workspaceId);
    if (!current) {
      return err({ type: "not_found", taskId });
    }

    if (current.developmentStageId != null) {
      const stage = await developmentStagesService.getById(current.developmentStageId, workspaceId);
      if (stage && (stage.kind === "completed" || stage.kind === "cancelled")) {
        return err({ type: "status_not_applicable", taskId });
      }
    }

    try {
      const task = await taskRepository.updateStatus(taskId, workspaceId, status);
      return ok(task);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return err({ type: "not_found", taskId });
      }
      throw error;
    }
  },

  // design.md System Flows "開発段階の変更": resolve kind → child check only
  // for completed → stamp/clear completedAt → reset status only when the stage
  // actually changes. assigneeUserId is only applied when currently null
  // (Requirements 12.6-12.8 / kanban move).
  // task-status-model 3.1: aggregates completedAt, status reset, and parent
  // completion constraints here (Requirements 2.1-2.3, 2.5, 4.4, 5.1-5.4).
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

    const relatedCheck = await assertRelatedResourcesInWorkspace(workspaceId, { developmentStageId });
    if (!relatedCheck.ok) {
      return relatedCheck;
    }

    let stageKind: DevelopmentStageKind | null = null;
    if (developmentStageId != null) {
      const stage = await developmentStagesService.getById(developmentStageId, workspaceId);
      if (!stage) {
        return err({
          type: "validation_error",
          message: "developmentStageId does not exist in the current workspace",
        });
      }
      stageKind = stage.kind;
    }

    if (stageKind === "completed") {
      const incompleteChildren = await taskRepository.countIncompleteChildren(taskId);
      if (incompleteChildren > 0) {
        return err({ type: "incomplete_children", taskId });
      }
    }

    const completedAt = stageKind === "completed" ? new Date() : null;
    const stageChanged = current.developmentStageId !== developmentStageId;

    const data: {
      developmentStageId: string | null;
      completedAt: Date | null;
      status?: TaskStatus;
      assigneeUserId?: string;
    } = { developmentStageId, completedAt };
    if (stageChanged) {
      data.status = "not_started";
    }

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

  // General field edit (title/priority/detail/caseId/isRequiredForCase/
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
    if (input.detail !== undefined) data.detail = input.detail;
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
      const relatedCheck = await assertRelatedResourcesInWorkspace(workspaceId, { caseId: input.caseId });
      if (!relatedCheck.ok) {
        return relatedCheck;
      }
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

    const closedParentCheck = await assertParentCanTakeOpenChildren(parent, workspaceId);
    if (!closedParentCheck.ok) {
      return closedParentCheck;
    }

    const title = input.title.trim();
    if (title.length === 0) {
      return err({ type: "validation_error", message: "title is required" });
    }

    const assigneeCheck = await assertAssigneeIsWorkspaceMember(workspaceId, input.assigneeUserId);
    if (!assigneeCheck.ok) {
      return assigneeCheck;
    }

    const relatedCheck = await assertRelatedResourcesInWorkspace(workspaceId, {
      caseId: input.caseId,
      parentTaskId,
    });
    if (!relatedCheck.ok) {
      return relatedCheck;
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

    const closedParentCheck = await assertParentCanTakeOpenChildren(original, workspaceId);
    if (!closedParentCheck.ok) {
      return closedParentCheck;
    }

    for (const part of parts) {
      const assigneeCheck = await assertAssigneeIsWorkspaceMember(workspaceId, part.assigneeUserId);
      if (!assigneeCheck.ok) {
        return assigneeCheck;
      }
      // Reject cross-workspace related IDs on part input even though case/
      // parent are overwritten by inheritance below (Requirement 3.5).
      const relatedCheck = await assertRelatedResourcesInWorkspace(workspaceId, {
        caseId: part.caseId,
        parentTaskId: part.parentTaskId,
      });
      if (!relatedCheck.ok) {
        return relatedCheck;
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

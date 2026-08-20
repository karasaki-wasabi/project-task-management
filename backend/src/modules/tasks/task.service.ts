import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { err, ok, type Result } from "../../shared/result.js";
import type { DbClient, SoftDeleteTx } from "../../shared/soft-delete.repository.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { activityLogService } from "../activity-logs/activity-log.service.js";
import type {
  FieldName,
  RecordActorInput,
} from "../activity-logs/activity-log.types.js";
import { caseReadService } from "../cases/case-read.service.js";
import { developmentStagesService } from "../development-stages/development-stage.service.js";
import type { DevelopmentStageKind } from "../development-stages/development-stage.types.js";
import { workspaceService } from "../workspaces/workspace.service.js";
import { resolveClosureState } from "./task.closure.js";
import { taskRepository } from "./task.repository.js";
import type {
  CreateTaskInput,
  GetTaskOptions,
  Task,
  TaskError,
  TaskListFilter,
  TaskStatus,
  UpdateTaskInput,
} from "./task.types.js";

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

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

async function assertParentChangeIsValid(
  taskId: string,
  workspaceId: VerifiedWorkspaceId,
  parentTaskId: string | null,
): Promise<Result<void, TaskError>> {
  if (parentTaskId === null) {
    return ok(undefined);
  }

  const parent = await taskRepository.findById(parentTaskId, workspaceId);
  if (!parent) {
    return err({
      type: "validation_error",
      message: "parentTaskId does not exist in the current workspace",
    });
  }

  const visited = new Set<string>();
  let ancestor: Task | null = parent;
  while (ancestor !== null) {
    if (ancestor.id === taskId || visited.has(ancestor.id)) {
      return err({
        type: "validation_error",
        message: "parentTaskId would create a cycle",
      });
    }
    visited.add(ancestor.id);

    ancestor =
      ancestor.parentTaskId === null
        ? null
        : await taskRepository.findById(
            ancestor.parentTaskId,
            workspaceId,
            { includeDeleted: true },
          );
  }

  const closedParentCheck = await assertParentCanTakeOpenChildren(parent, workspaceId);
  if (!closedParentCheck.ok) {
    return closedParentCheck;
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
    const caseRecord = await caseReadService.findInWorkspace(refs.caseId, workspaceId, client);
    if (!caseRecord) {
      return err({
        type: "validation_error",
        message: "caseId does not exist in the current workspace",
      });
    }
  }
  if (refs.parentTaskId != null) {
    const parent = await taskRepository.findById(refs.parentTaskId, workspaceId, {}, client);
    if (!parent) {
      return err({
        type: "validation_error",
        message: "parentTaskId does not exist in the current workspace",
      });
    }
  }
  if (refs.developmentStageId != null) {
    const stage = await developmentStagesService.getById(
      refs.developmentStageId,
      workspaceId,
      client,
    );
    if (!stage) {
      return err({
        type: "validation_error",
        message: "developmentStageId does not exist in the current workspace",
      });
    }
  }
  return ok(undefined);
}

async function getWritableTask(
  taskId: string,
  workspaceId: VerifiedWorkspaceId,
  client: DbClient = db,
): Promise<Result<Task, TaskError>> {
  const task = await taskRepository.findById(taskId, workspaceId, { includeDeleted: true }, client);
  if (!task) {
    return err({ type: "not_found", taskId });
  }
  if (task.deletedAt !== null) {
    return err({ type: "deleted_task", taskId });
  }
  return ok(task);
}

function activityValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function runActivityWrite<T>(
  client: DbClient,
  write: (writeClient: DbClient) => Promise<T>,
): Promise<T> {
  if (client === db) {
    return db.$transaction((tx) => write(tx));
  }
  return write(client);
}

async function recordFieldChanges(
  taskId: string,
  actor: RecordActorInput,
  fields: Array<{
    field: FieldName;
    beforeValue: unknown;
    afterValue: unknown;
  }>,
  client: DbClient,
): Promise<void> {
  for (const change of fields) {
    const beforeValue = activityValue(change.beforeValue);
    const afterValue = activityValue(change.afterValue);
    if (beforeValue === afterValue) continue;
    await activityLogService.record(
      {
        taskId,
        actor,
        operation: "field_changed",
        field: change.field,
        beforeValue,
        afterValue,
      },
      client as SoftDeleteTx,
    );
  }
}

export const tasksService = {
  async create(
    input: CreateTaskInput,
    actor: RecordActorInput,
    client: DbClient = db,
  ): Promise<Result<Task, TaskError>> {
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
      const parent = await taskRepository.findById(input.parentTaskId, input.workspaceId, {}, client);
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
      const task = await runActivityWrite(client, async (writeClient) => {
        const created = await taskRepository.create({ ...input, title }, writeClient);
        await activityLogService.record(
          {
            taskId: created.id,
            actor,
            operation: "task_created",
          },
          writeClient as SoftDeleteTx,
        );
        if (created.parentTaskId != null) {
          await taskRepository.recalculateAncestorStoryPoints(
            created.parentTaskId,
            input.workspaceId,
            writeClient,
          );
        }
        return created;
      });
      return ok(task);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return err({ type: "validation_error", message: "caseId, assigneeUserId, or parentTaskId does not exist" });
      }
      throw error;
    }
  },

  async getById(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    options: GetTaskOptions = {},
  ): Promise<Result<Task, TaskError>> {
    const task = await taskRepository.findById(taskId, workspaceId, options);
    if (!task) {
      return err({ type: "not_found", taskId });
    }
    return ok(task);
  },

  async updateStatus(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    status: TaskStatus,
    actor: RecordActorInput,
  ): Promise<Result<Task, TaskError>> {
    const writable = await getWritableTask(taskId, workspaceId);
    if (!writable.ok) return writable;
    const current = writable.value;

    if (current.developmentStageId != null) {
      const stage = await developmentStagesService.getById(current.developmentStageId, workspaceId);
      if (stage && (stage.kind === "completed" || stage.kind === "cancelled")) {
        return err({ type: "status_not_applicable", taskId });
      }
    }

    try {
      const task = await runActivityWrite(db, async (writeClient) => {
        const updated = await taskRepository.updateStatus(taskId, workspaceId, status, writeClient);
        await recordFieldChanges(
          taskId,
          actor,
          [{
            field: "status",
            beforeValue: current.status,
            afterValue: updated.status,
          }],
          writeClient,
        );
        return updated;
      });
      return ok(task);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return err({ type: "not_found", taskId });
      }
      throw error;
    }
  },

  async updateDevelopmentStage(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    developmentStageId: string | null,
    actor: RecordActorInput,
    assigneeUserId?: string,
  ): Promise<Result<Task, TaskError>> {
    const writable = await getWritableTask(taskId, workspaceId);
    if (!writable.ok) return writable;
    const current = writable.value;

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
      const task = await runActivityWrite(db, async (writeClient) => {
        const updated = await taskRepository.updateDevelopmentStage(
          taskId,
          workspaceId,
          data,
          writeClient,
        );
        await recordFieldChanges(
          taskId,
          actor,
          [
            {
              field: "developmentStage",
              beforeValue: current.developmentStageId,
              afterValue: updated.developmentStageId,
            },
            {
              field: "assignee",
              beforeValue: current.assigneeUserId,
              afterValue: updated.assigneeUserId,
            },
          ],
          writeClient,
        );
        return updated;
      });
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

  async update(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    input: UpdateTaskInput,
    actor: RecordActorInput,
  ): Promise<Result<Task, TaskError>> {
    const writable = await getWritableTask(taskId, workspaceId);
    if (!writable.ok) return writable;
    const current = writable.value;

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
    if (input.scheduledEndDate !== undefined) data.scheduledEndDate = input.scheduledEndDate;
    if (input.assigneeUserId !== undefined) {
      const assigneeCheck = await assertAssigneeIsWorkspaceMember(workspaceId, input.assigneeUserId);
      if (!assigneeCheck.ok) {
        return assigneeCheck;
      }
      data.assigneeUserId = input.assigneeUserId;
    }

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

    if (input.parentTaskId !== undefined) {
      const parentCheck = await assertParentChangeIsValid(taskId, workspaceId, input.parentTaskId);
      if (!parentCheck.ok) {
        return parentCheck;
      }
      data.parentTaskId = input.parentTaskId;
    }

    if (input.storyPoints !== undefined) {
      const hasChildren = await taskRepository.hasChildren(taskId, workspaceId);
      if (hasChildren) {
        return err({
          type: "validation_error",
          message: "storyPoints cannot be set directly on a parent task",
        });
      }
      data.storyPoints = input.storyPoints;
    }

    const parentTaskIdChanging = input.parentTaskId !== undefined;
    const storyPointsChanging = input.storyPoints !== undefined;

    try {
      const task = await runActivityWrite(db, async (writeClient) => {
        const updated = await taskRepository.update(taskId, workspaceId, data, writeClient);
        await recordFieldChanges(
          taskId,
          actor,
          [
            { field: "title", beforeValue: current.title, afterValue: updated.title },
            { field: "priority", beforeValue: current.priority, afterValue: updated.priority },
            { field: "detail", beforeValue: current.detail, afterValue: updated.detail },
            { field: "assignee", beforeValue: current.assigneeUserId, afterValue: updated.assigneeUserId },
            { field: "case", beforeValue: current.caseId, afterValue: updated.caseId },
            {
              field: "isRequiredForCase",
              beforeValue: current.isRequiredForCase,
              afterValue: updated.isRequiredForCase,
            },
            { field: "parentTask", beforeValue: current.parentTaskId, afterValue: updated.parentTaskId },
            {
              field: "scheduledEndDate",
              beforeValue: current.scheduledEndDate,
              afterValue: updated.scheduledEndDate,
            },
            {
              field: "storyPoints",
              beforeValue: current.storyPoints,
              afterValue: updated.storyPoints,
            },
          ],
          writeClient,
        );

        if (storyPointsChanging && updated.parentTaskId != null) {
          await taskRepository.recalculateAncestorStoryPoints(
            updated.parentTaskId,
            workspaceId,
            writeClient,
          );
        }
        if (parentTaskIdChanging) {
          if (current.parentTaskId != null) {
            await taskRepository.recalculateAncestorStoryPoints(
              current.parentTaskId,
              workspaceId,
              writeClient,
            );
          }
          if (updated.parentTaskId != null) {
            await taskRepository.recalculateAncestorStoryPoints(
              updated.parentTaskId,
              workspaceId,
              writeClient,
            );
          }
        }
        return updated;
      });
      return ok(task);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return err({ type: "not_found", taskId });
      }
      if (isForeignKeyViolation(error)) {
        return err({
          type: "validation_error",
          message: "caseId, assigneeUserId, or parentTaskId does not exist",
        });
      }
      throw error;
    }
  },

  async addChild(
    parentTaskId: string,
    workspaceId: VerifiedWorkspaceId,
    input: CreateTaskInput,
    actor: RecordActorInput,
  ): Promise<Result<Task, TaskError>> {
    const writable = await getWritableTask(parentTaskId, workspaceId);
    if (!writable.ok) return writable;
    const parent = writable.value;

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
      const child = await runActivityWrite(db, async (writeClient) => {
        const created = await taskRepository.create(
          { ...input, title, parentTaskId, workspaceId },
          writeClient,
        );
        await activityLogService.record(
          {
            taskId: created.id,
            actor,
            operation: "task_created",
          },
          writeClient as SoftDeleteTx,
        );
        await taskRepository.recalculateAncestorStoryPoints(parentTaskId, workspaceId, writeClient);
        return created;
      });
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
    actor: RecordActorInput,
  ): Promise<Result<Task[], TaskError>> {
    const writable = await getWritableTask(taskId, workspaceId);
    if (!writable.ok) return writable;
    const original = writable.value;

    if (parts.length < 2) {
      return err({ type: "validation_error", message: "splitTask requires at least 2 parts" });
    }
    for (const part of parts) {
      if (part.title.trim().length === 0) {
        return err({ type: "validation_error", message: "title is required for every part" });
      }
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
      const relatedCheck = await assertRelatedResourcesInWorkspace(workspaceId, {
        caseId: part.caseId,
        parentTaskId: part.parentTaskId,
      });
      if (!relatedCheck.ok) {
        return relatedCheck;
      }
    }

    const inheritedParts = parts.map((part) => ({
      ...part,
      title: part.title.trim(),
      caseId: original.caseId ?? undefined,
      priority: original.priority,
      parentTaskId: taskId,
      workspaceId,
    }));

    try {
      const created = await runActivityWrite(db, async (writeClient) => {
        const createdParts = await taskRepository.createMany(inheritedParts, writeClient);
        for (const part of createdParts) {
          await activityLogService.record(
            {
              taskId: part.id,
              actor,
              operation: "task_created",
            },
            writeClient as SoftDeleteTx,
          );
        }
        await taskRepository.recalculateAncestorStoryPoints(taskId, workspaceId, writeClient);
        return createdParts;
      });
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
    actor: RecordActorInput,
    requestId: string = randomUUID(),
    client: DbClient = db,
  ): Promise<Result<void, TaskError>> {
    const writable = await getWritableTask(taskId, workspaceId, client);
    if (!writable.ok) return writable;
    const parentTaskId = writable.value.parentTaskId;

    try {
      await runActivityWrite(client, async (writeClient) => {
        await taskRepository.delete(taskId, workspaceId, writeClient);
        await activityLogService.record(
          {
            taskId,
            actor,
            operation: "task_deleted",
          },
          writeClient as SoftDeleteTx,
        );
        if (parentTaskId != null) {
          await taskRepository.recalculateAncestorStoryPoints(parentTaskId, workspaceId, writeClient);
        }
      });
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

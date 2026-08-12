// Persistence for Tasks (task 3.1, design.md "Backend/tasks"). Soft-delete /
// audit-column behavior and the default `deletedAt: null` list filter come
// from the shared `db` client (task 1.4). Optional DbClient supports
// CaseService same-TX apply (task 4).
// workspace-resource-scope task 3.1: all queries take VerifiedWorkspaceId and
// compose where via withWorkspaceScope.
import { db } from "../../shared/db.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import { withWorkspaceScope, type VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { openTaskFilter } from "./task.closure.js";
import type {
  CreateTaskInput,
  GetTaskOptions,
  Task,
  TaskListFilter,
  TaskStatus,
  UpdateTaskInput,
} from "./task.types.js";

export const taskRepository = {
  create(input: CreateTaskInput, client: DbClient = db): Promise<Task> {
    return client.task.create({
      data: {
        title: input.title,
        priority: input.priority,
        detail: input.detail,
        caseId: input.caseId,
        // design.md TasksService Implementation Notes: "caseId未指定時は
        // isRequiredForCaseをfalse固定にする".
        isRequiredForCase: input.caseId ? (input.isRequiredForCase ?? false) : false,
        assigneeUserId: input.assigneeUserId,
        parentTaskId: input.parentTaskId,
        // RecurrenceService-only (see task.types.ts CreateTaskInput comment).
        sourceTemplateId: input.sourceTemplateId,
        sourceAnchor: input.sourceAnchor,
        scheduledEndDate: input.scheduledEndDate,
        workspaceId: input.workspaceId,
      },
    });
  },

  findById(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    options: GetTaskOptions = {},
    client: DbClient = db,
  ): Promise<Task | null> {
    const where = options.includeDeleted ? { id, deletedAt: undefined } : { id };
    return client.task.findFirst({ where: withWorkspaceScope(where, workspaceId) });
  },

  // task-status-model 3.2: status only — completedAt is owned by updateDevelopmentStage.
  updateStatus(id: string, workspaceId: VerifiedWorkspaceId, status: TaskStatus): Promise<Task> {
    return db.task.update({
      where: withWorkspaceScope({ id, deletedAt: null }, workspaceId),
      data: { status },
    });
  },

  updateDevelopmentStage(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    data: {
      developmentStageId: string | null;
      assigneeUserId?: string;
      status?: TaskStatus;
      completedAt?: Date | null;
    },
  ): Promise<Task> {
    return db.task.update({ where: withWorkspaceScope({ id, deletedAt: null }, workspaceId), data });
  },

  update(id: string, workspaceId: VerifiedWorkspaceId, data: UpdateTaskInput): Promise<Task> {
    return db.task.update({ where: withWorkspaceScope({ id, deletedAt: null }, workspaceId), data });
  },

  delete(id: string, workspaceId: VerifiedWorkspaceId, client: DbClient = db): Promise<Task> {
    return client.task.delete({ where: withWorkspaceScope({ id, deletedAt: null }, workspaceId) });
  },

  list(filter: TaskListFilter): Promise<Task[]> {
    return db.task.findMany({
      where: withWorkspaceScope(
        {
          // design.md "Backend/tasks > TasksService.list 未割当フィルタ拡張":
          // unassignedCase is exclusive and takes priority over any caseId
          // also present on the filter.
          caseId: filter.unassignedCase ? null : filter.caseId,
          assigneeUserId: filter.assigneeUserId,
        },
        filter.workspaceId,
      ),
      orderBy: { createdAt: "asc" },
    });
  },

  // Soft-deleted children are excluded by the shared `db` client's default
  // filter, so a deleted (rather than closed) child never blocks completion.
  // Open = not on a completed/cancelled stage (task-status-model 3.1 / 5.1).
  countIncompleteChildren(parentTaskId: string): Promise<number> {
    return db.task.count({ where: { parentTaskId, ...openTaskFilter } });
  },

  // Interactive-transaction callback form; equivalent to the `$transaction([...])`
  // array form for this client (verified: no `query.create` hook exists on the
  // soft-delete extension), used here for readability when building the
  // per-part insert loop.
  createMany(inputs: CreateTaskInput[]): Promise<Task[]> {
    return db.$transaction(async (tx) => {
      const created: Task[] = [];
      for (const input of inputs) {
        created.push(
          await tx.task.create({
            data: {
              title: input.title,
              priority: input.priority,
              detail: input.detail,
              caseId: input.caseId,
              isRequiredForCase: input.caseId ? (input.isRequiredForCase ?? false) : false,
              assigneeUserId: input.assigneeUserId,
              parentTaskId: input.parentTaskId,
              workspaceId: input.workspaceId,
            },
          }),
        );
      }
      return created;
    });
  },
};

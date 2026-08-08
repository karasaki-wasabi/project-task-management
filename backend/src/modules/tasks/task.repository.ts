// Persistence for Tasks (task 3.1, design.md "Backend/tasks"). Soft-delete /
// audit-column behavior and the default `deletedAt: null` list filter come
// from the shared `db` client (task 1.4).
import { db } from "../../shared/db.js";
import type { CreateTaskInput, Task, TaskListFilter, TaskStatus, UpdateTaskInput } from "./task.types.js";

export const taskRepository = {
  create(input: CreateTaskInput): Promise<Task> {
    return db.task.create({
      data: {
        title: input.title,
        priority: input.priority,
        memo: input.memo,
        caseId: input.caseId,
        // design.md TasksService Implementation Notes: "caseId未指定時は
        // isRequiredForCaseをfalse固定にする".
        isRequiredForCase: input.caseId ? (input.isRequiredForCase ?? false) : false,
        assigneeUserId: input.assigneeUserId,
        parentTaskId: input.parentTaskId,
        // RecurrenceService-only (see task.types.ts CreateTaskInput comment).
        sourceTemplateId: input.sourceTemplateId,
        sourceAnchor: input.sourceAnchor,
        scheduledDate: input.scheduledDate,
      },
    });
  },

  findById(id: string): Promise<Task | null> {
    return db.task.findUnique({ where: { id } });
  },

  updateStatus(id: string, status: TaskStatus, completedAt: Date | null): Promise<Task> {
    return db.task.update({ where: { id }, data: { status, completedAt } });
  },

  updateDevelopmentStage(
    id: string,
    data: { developmentStageId: string | null; assigneeUserId?: string },
  ): Promise<Task> {
    return db.task.update({ where: { id }, data });
  },

  update(id: string, data: UpdateTaskInput): Promise<Task> {
    return db.task.update({ where: { id }, data });
  },

  delete(id: string): Promise<Task> {
    return db.task.delete({ where: { id } });
  },

  list(filter: TaskListFilter): Promise<Task[]> {
    return db.task.findMany({
      where: {
        // design.md "Backend/tasks > TasksService.list 未割当フィルタ拡張":
        // unassignedCase is exclusive and takes priority over any caseId
        // also present on the filter.
        caseId: filter.unassignedCase ? null : filter.caseId,
        assigneeUserId: filter.assigneeUserId,
      },
      orderBy: { createdAt: "asc" },
    });
  },

  // Soft-deleted children are excluded by the shared `db` client's default
  // filter, so a deleted (rather than done) child never blocks completion.
  countIncompleteChildren(parentTaskId: string): Promise<number> {
    return db.task.count({ where: { parentTaskId, status: { not: "done" } } });
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
              memo: input.memo,
              caseId: input.caseId,
              isRequiredForCase: input.caseId ? (input.isRequiredForCase ?? false) : false,
              assigneeUserId: input.assigneeUserId,
              parentTaskId: input.parentTaskId,
            },
          }),
        );
      }
      return created;
    });
  },
};

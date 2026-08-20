import type { Prisma } from "@prisma/client";
import { db } from "../../shared/db.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import { withWorkspaceScope, type VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { leafTaskFilter, openTaskFilter } from "./task.closure.js";
import type {
  CreateTaskInput,
  GetTaskOptions,
  Task,
  TaskListFilter,
  TaskStatus,
  UpdateTaskInput,
} from "./task.types.js";

type GeneratedSourceAnchor = NonNullable<Task["sourceAnchor"]>;

async function findSubtreeIds(
  rootTaskId: string,
  workspaceId: VerifiedWorkspaceId,
): Promise<string[]> {
  const tasks = await db.task.findMany({
    where: withWorkspaceScope({ deletedAt: undefined }, workspaceId),
    select: { id: true, parentTaskId: true },
  });
  const childrenByParent = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.parentTaskId === null) continue;
    const children = childrenByParent.get(task.parentTaskId) ?? [];
    children.push(task.id);
    childrenByParent.set(task.parentTaskId, children);
  }

  const subtreeIds = new Set([rootTaskId]);
  const pending = [rootTaskId];
  while (pending.length > 0) {
    const parentId = pending.pop();
    if (parentId === undefined) break;
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (subtreeIds.has(childId)) continue;
      subtreeIds.add(childId);
      pending.push(childId);
    }
  }
  return [...subtreeIds];
}

export const taskRepository = {
  create(input: CreateTaskInput, client: DbClient = db): Promise<Task> {
    return client.task.create({
      data: {
        title: input.title,
        priority: input.priority,
        detail: input.detail,
        caseId: input.caseId,
        isRequiredForCase: input.caseId ? (input.isRequiredForCase ?? false) : false,
        assigneeUserId: input.assigneeUserId,
        parentTaskId: input.parentTaskId,
        storyPoints: input.storyPoints,
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

  updateStatus(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    status: TaskStatus,
    client: DbClient = db,
  ): Promise<Task> {
    return client.task.update({
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
    client: DbClient = db,
  ): Promise<Task> {
    return client.task.update({ where: withWorkspaceScope({ id, deletedAt: null }, workspaceId), data });
  },

  update(
    id: string,
    workspaceId: VerifiedWorkspaceId,
    data: UpdateTaskInput,
    client: DbClient = db,
  ): Promise<Task> {
    return client.task.update({ where: withWorkspaceScope({ id, deletedAt: null }, workspaceId), data });
  },

  delete(id: string, workspaceId: VerifiedWorkspaceId, client: DbClient = db): Promise<Task> {
    return client.task.delete({ where: withWorkspaceScope({ id, deletedAt: null }, workspaceId) });
  },

  async list(filter: TaskListFilter): Promise<Task[]> {
    const excludedTaskIds =
      filter.excludeSubtreeOf === undefined
        ? undefined
        : await findSubtreeIds(filter.excludeSubtreeOf, filter.workspaceId);

    return db.task.findMany({
      where: withWorkspaceScope(
        {
          caseId: filter.unassignedCase ? null : filter.caseId,
          assigneeUserId: filter.assigneeUserId,
          title: filter.titleContains ? { contains: filter.titleContains } : undefined,
          id: excludedTaskIds === undefined ? undefined : { notIn: excludedTaskIds },
          ...(filter.excludeClosed ? openTaskFilter : {}),
        },
        filter.workspaceId,
      ),
      orderBy: { createdAt: "asc" },
    });
  },

  countIncompleteChildren(parentTaskId: string): Promise<number> {
    return db.task.count({ where: { parentTaskId, ...openTaskFilter } });
  },

  async hasChildren(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    client: DbClient = db,
  ): Promise<boolean> {
    const count = await client.task.count({
      where: withWorkspaceScope({ parentTaskId: taskId }, workspaceId),
    });
    return count > 0;
  },

  async recalculateAncestorStoryPoints(
    startTaskId: string,
    workspaceId: VerifiedWorkspaceId,
    client: DbClient,
  ): Promise<void> {
    let currentId: string | null = startTaskId;
    while (currentId !== null) {
      const current: { parentTaskId: string | null } | null = await client.task.findFirst({
        where: withWorkspaceScope({ id: currentId }, workspaceId),
        select: { parentTaskId: true },
      });
      if (current === null) break;

      const children = await client.task.findMany({
        where: withWorkspaceScope({ parentTaskId: currentId }, workspaceId),
        select: { storyPoints: true },
      });

      const storyPoints =
        children.length === 0
          ? null
          : children.reduce((sum, child) => sum + (child.storyPoints ?? 0), 0);

      await client.task.update({
        where: withWorkspaceScope({ id: currentId, deletedAt: null }, workspaceId),
        data: { storyPoints },
      });

      currentId = current.parentTaskId;
    }
  },

  async detachFromCase(caseId: string, client: DbClient = db): Promise<void> {
    await client.task.updateMany({ where: { caseId }, data: { caseId: null } });
  },

  async clearDevelopmentStage(developmentStageId: string, client: DbClient = db): Promise<void> {
    await client.task.updateMany({
      where: { developmentStageId },
      data: { developmentStageId: null },
    });
  },

  listGeneratedByAnchors(
    caseId: string,
    anchors: GeneratedSourceAnchor[],
    client: DbClient = db,
  ): Promise<Array<{ id: string; workspaceId: string }>> {
    return client.task.findMany({
      where: { caseId, sourceAnchor: { in: anchors } },
      select: { id: true, workspaceId: true },
    });
  },

  countRequiredMatching(
    caseId: string,
    workspaceId: VerifiedWorkspaceId,
    progressWhere: Prisma.TaskWhereInput,
  ): Promise<number> {
    return db.task.count({
      where: withWorkspaceScope(
        {
          caseId,
          isRequiredForCase: true,
          ...progressWhere,
        },
        workspaceId,
      ),
    });
  },

  async countCompletedWithPointsInPeriodIncludingDeleted(
    periodStart: Date,
    periodEnd: Date,
    workspaceId: VerifiedWorkspaceId,
    caseId?: string,
  ): Promise<{ count: number; points: number }> {
    const baseWhere = withWorkspaceScope(
      {
        completedAt: { gte: periodStart, lte: periodEnd },
        deletedAt: undefined,
        ...(caseId !== undefined ? { caseId } : {}),
      },
      workspaceId,
    );

    const [count, pointsAgg] = await Promise.all([
      db.task.count({ where: baseWhere }),
      db.task.aggregate({
        where: { ...baseWhere, ...leafTaskFilter },
        _sum: { storyPoints: true },
      }),
    ]);

    return { count, points: pointsAgg._sum.storyPoints ?? 0 };
  },

  async countOpenTasksWithPoints(
    workspaceId: VerifiedWorkspaceId,
    caseId: string,
  ): Promise<{ count: number; points: number }> {
    const baseWhere = withWorkspaceScope(
      {
        caseId,
        deletedAt: null,
        ...openTaskFilter,
      },
      workspaceId,
    );

    const [count, pointsAgg] = await Promise.all([
      db.task.count({ where: baseWhere }),
      db.task.aggregate({
        where: { ...baseWhere, ...leafTaskFilter },
        _sum: { storyPoints: true },
      }),
    ]);

    return { count, points: pointsAgg._sum.storyPoints ?? 0 };
  },

  async createMany(inputs: CreateTaskInput[], client: DbClient = db): Promise<Task[]> {
    const created: Task[] = [];
    for (const input of inputs) {
      created.push(
        await client.task.create({
          data: {
            title: input.title,
            priority: input.priority,
            detail: input.detail,
            caseId: input.caseId,
            isRequiredForCase: input.caseId ? (input.isRequiredForCase ?? false) : false,
            assigneeUserId: input.assigneeUserId,
            parentTaskId: input.parentTaskId,
            storyPoints: input.storyPoints,
            workspaceId: input.workspaceId,
          },
        }),
      );
    }
    return created;
  },
};

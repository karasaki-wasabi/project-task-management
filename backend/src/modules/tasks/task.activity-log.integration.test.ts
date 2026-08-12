import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import type { RecordActorInput } from "../activity-logs/activity-log.types.js";
import { tasksService } from "./task.service.js";

let userId: string;
let workspaceId: VerifiedWorkspaceId;

const taskIds: string[] = [];
const stageIds: string[] = [];
const caseIds: string[] = [];

function userActor(): RecordActorInput {
  return { type: "user", userId };
}

async function createTask(title: string) {
  const task = await db.task.create({
    data: {
      title,
      priority: "medium",
      workspaceId,
    },
  });
  taskIds.push(task.id);
  return task;
}

async function logsFor(taskId: string) {
  return db.activityLog.findMany({
    where: { taskId },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
}

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("task-activity-log") });
  userId = user.id;
  const workspace = await db.workspace.create({
    data: {
      name: `task-activity-log-${randomUUID()}`,
      createdByUserId: userId,
    },
  });
  workspaceId = workspace.id as VerifiedWorkspaceId;
});

afterAll(async () => {
  if (taskIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM activity_logs WHERE task_id IN (${taskIds.map(() => "?").join(",")})`,
      ...taskIds,
    );
    await db.$executeRawUnsafe(
      `DELETE FROM tasks WHERE id IN (${taskIds.map(() => "?").join(",")})`,
      ...taskIds,
    );
  }
  if (stageIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM development_stages WHERE id IN (${stageIds.map(() => "?").join(",")})`,
      ...stageIds,
    );
  }
  if (caseIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM cases WHERE id IN (${caseIds.map(() => "?").join(",")})`,
      ...caseIds,
    );
  }
  await db.$executeRawUnsafe("DELETE FROM workspaces WHERE id = ?", workspaceId);
  await db.$executeRawUnsafe("DELETE FROM users WHERE id = ?", userId);
  await db.$disconnect();
});

describe("tasksService activity log hooks", () => {
  it("requires an actor for every logged write method at compile time", () => {
    if (false) {
      // @ts-expect-error actor is required
      void tasksService.create({ title: "contract", priority: "low", workspaceId });
      // @ts-expect-error actor is required
      void tasksService.updateStatus("task-id", workspaceId, "not_started");
      // @ts-expect-error actor is required
      void tasksService.updateDevelopmentStage("task-id", workspaceId, null);
      // @ts-expect-error actor is required
      void tasksService.update("task-id", workspaceId, { title: "contract" });
      // @ts-expect-error actor is required
      void tasksService.addChild("task-id", workspaceId, {
        title: "contract",
        priority: "low",
        workspaceId,
      });
      // @ts-expect-error actor is required
      void tasksService.splitTask("task-id", workspaceId, []);
      // @ts-expect-error actor is required
      void tasksService.delete("task-id", workspaceId);
    }

    expect(true).toBe(true);
  });

  it("records task creation and deletion with the supplied user actor", async () => {
    const created = await tasksService.create(
      {
        title: "logged lifecycle",
        priority: "high",
        workspaceId,
      },
      userActor(),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    taskIds.push(created.value.id);

    const deleted = await tasksService.delete(
      created.value.id,
      workspaceId,
      userActor(),
      randomUUID(),
    );
    expect(deleted.ok).toBe(true);

    expect(await logsFor(created.value.id)).toMatchObject([
      {
        actorUserId: userId,
        actorSourceLabel: null,
        operationType: "task_created",
        fieldName: null,
      },
      {
        actorUserId: userId,
        actorSourceLabel: null,
        operationType: "task_deleted",
        fieldName: null,
      },
    ]);
  });

  it("records status and development-stage changes without reset or completedAt logs", async () => {
    const task = await createTask("status and stage");
    const stage = await db.developmentStage.create({
      data: {
        name: `completed-${randomUUID()}`,
        order: 980,
        kind: "completed",
        workspaceId,
      },
    });
    stageIds.push(stage.id);

    const status = await tasksService.updateStatus(
      task.id,
      workspaceId,
      "in_progress",
      userActor(),
    );
    expect(status.ok).toBe(true);

    const moved = await tasksService.updateDevelopmentStage(
      task.id,
      workspaceId,
      stage.id,
      userActor(),
      undefined,
    );
    expect(moved.ok).toBe(true);

    const logs = await logsFor(task.id);
    expect(logs.map((log) => ({
      operationType: log.operationType,
      fieldName: log.fieldName,
      beforeValue: log.beforeValue,
      afterValue: log.afterValue,
    }))).toEqual([
      {
        operationType: "field_changed",
        fieldName: "status",
        beforeValue: "not_started",
        afterValue: "in_progress",
      },
      {
        operationType: "field_changed",
        fieldName: "developmentStage",
        beforeValue: null,
        afterValue: stage.id,
      },
    ]);
  });

  it("records every changed general field including case-clear required reset", async () => {
    const caseRecord = await db.case.create({
      data: {
        name: `activity-case-${randomUUID()}`,
        workspaceId,
      },
    });
    caseIds.push(caseRecord.id);
    const task = await db.task.create({
      data: {
        title: "before",
        priority: "low",
        detail: "old detail",
        caseId: caseRecord.id,
        isRequiredForCase: true,
        scheduledEndDate: new Date("2042-01-01T00:00:00.000Z"),
        workspaceId,
      },
    });
    taskIds.push(task.id);

    const updated = await tasksService.update(
      task.id,
      workspaceId,
      {
        title: "after",
        priority: "high",
        detail: "new detail",
        caseId: null,
        scheduledEndDate: new Date("2042-02-02T00:00:00.000Z"),
      },
      userActor(),
    );
    expect(updated.ok).toBe(true);

    const logs = await logsFor(task.id);
    expect(logs.map((log) => log.fieldName)).toEqual([
      "title",
      "priority",
      "detail",
      "case",
      "isRequiredForCase",
      "scheduledEndDate",
    ]);
    expect(logs.find((log) => log.fieldName === "isRequiredForCase")).toMatchObject({
      beforeValue: "true",
      afterValue: "false",
    });
  });

  it("records task_created separately for addChild and every split part", async () => {
    const parent = await createTask("parent");

    const child = await tasksService.addChild(
      parent.id,
      workspaceId,
      {
        title: "child",
        priority: "low",
        workspaceId,
      },
      userActor(),
    );
    expect(child.ok).toBe(true);
    if (!child.ok) return;
    taskIds.push(child.value.id);

    const split = await tasksService.splitTask(
      parent.id,
      workspaceId,
      [
        { title: "part one", priority: "low", workspaceId },
        { title: "part two", priority: "low", workspaceId },
      ],
      userActor(),
    );
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    taskIds.push(...split.value.map((task) => task.id));

    await expect(logsFor(child.value.id)).resolves.toMatchObject([
      { operationType: "task_created", actorUserId: userId },
    ]);
    for (const part of split.value) {
      await expect(logsFor(part.id)).resolves.toMatchObject([
        { operationType: "task_created", actorUserId: userId },
      ]);
    }
  });

  it("rolls back the task update when activity-log persistence fails", async () => {
    const task = await createTask("rollback before");

    const result = await tasksService.update(
      task.id,
      workspaceId,
      { title: "rollback after" },
      { type: "user", userId: randomUUID() },
    );
    expect(result.ok).toBe(false);

    const persisted = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(persisted.title).toBe("rollback before");
    await expect(logsFor(task.id)).resolves.toHaveLength(0);
  });
});

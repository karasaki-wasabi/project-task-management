import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { createUserData } from "../../test/user.fixture.js";
import { activityLogRepository } from "./activity-log.repository.js";
import { activityLogService } from "./activity-log.service.js";
import type { OperationType } from "./activity-log.types.js";

let userId: string;
let workspaceId: string;
let taskId: string;

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("activity-log-service") });
  userId = user.id;

  const workspace = await db.workspace.create({
    data: {
      name: `activity-log-service-${randomUUID()}`,
      createdByUserId: userId,
    },
  });
  workspaceId = workspace.id;

  const task = await db.task.create({
    data: {
      title: `activity-log-task-${randomUUID()}`,
      priority: "medium",
      workspaceId,
    },
  });
  taskId = task.id;
});

afterAll(async () => {
  await db.$executeRawUnsafe("DELETE FROM activity_logs WHERE task_id = ?", taskId);
  await db.$executeRawUnsafe("DELETE FROM tasks WHERE id = ?", taskId);
  await db.$executeRawUnsafe("DELETE FROM workspaces WHERE id = ?", workspaceId);
  await db.$executeRawUnsafe("DELETE FROM users WHERE id = ?", userId);
  await db.$disconnect();
});

describe("activityLogService", () => {
  it("records a user field change with before and after values", async () => {
    await db.$transaction((tx) =>
      activityLogService.record(
        {
          taskId,
          actor: { type: "user", userId },
          operation: "field_changed",
          field: "priority",
          beforeValue: "low",
          afterValue: "high",
        },
        tx,
      ),
    );

    const entries = await activityLogService.listDisplayable(taskId);

    expect(entries).toContainEqual(
      expect.objectContaining({
        taskId,
        actorUserId: userId,
        actorSourceLabel: null,
        operationType: "field_changed",
        fieldName: "priority",
        beforeValue: "low",
        afterValue: "high",
      }),
    );
  });

  it("records a system actor with its source label", async () => {
    await db.$transaction((tx) =>
      activityLogService.record(
        {
          taskId,
          actor: { type: "system", sourceLabel: "recurring_template" },
          operation: "task_created",
        },
        tx,
      ),
    );

    const recorded = await db.activityLog.findFirstOrThrow({
      where: { taskId, operationType: "task_created" },
      orderBy: { occurredAt: "desc" },
    });

    expect(recorded).toMatchObject({
      actorUserId: null,
      actorSourceLabel: "recurring_template",
    });
  });

  it("returns only field changes and excludes task and comment operations", async () => {
    const hiddenOperations: Exclude<OperationType, "field_changed">[] = [
      "task_created",
      "task_deleted",
      "comment_created",
      "comment_edited",
      "comment_deleted",
    ];

    await db.$transaction(async (tx) => {
      for (const operation of hiddenOperations) {
        await activityLogService.record(
          {
            taskId,
            actor: { type: "user", userId },
            operation,
          },
          tx,
        );
      }
      await activityLogService.record(
        {
          taskId,
          actor: { type: "user", userId },
          operation: "field_changed",
          field: "title",
          beforeValue: "before",
          afterValue: "after",
        },
        tx,
      );
    });

    const entries = await activityLogService.listDisplayable(taskId);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.operationType === "field_changed")).toBe(true);
    expect(entries).toContainEqual(
      expect.objectContaining({
        fieldName: "title",
        beforeValue: "before",
        afterValue: "after",
      }),
    );
  });

  it("rolls back a record when the caller transaction fails", async () => {
    const sourceLabel = `rollback-${randomUUID()}`;

    await expect(
      db.$transaction(async (tx) => {
        await activityLogService.record(
          {
            taskId,
            actor: { type: "system", sourceLabel },
            operation: "task_deleted",
          },
          tx,
        );
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    await expect(db.activityLog.findFirst({ where: { actorSourceLabel: sourceLabel } })).resolves.toBeNull();
  });

  it("does not expose update or delete operations", () => {
    expect(activityLogService).not.toHaveProperty("update");
    expect(activityLogService).not.toHaveProperty("delete");
    expect(activityLogRepository).not.toHaveProperty("update");
    expect(activityLogRepository).not.toHaveProperty("delete");
  });
});

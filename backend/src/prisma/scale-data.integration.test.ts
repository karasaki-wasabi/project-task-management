/**
 * 規模シード core（ensure / 再投入用部分削除 / runScaleSeed / cleanup）の実 DB 統合テスト。
 * SCALE 固定 ID のみ操作し、try/finally で物理掃除する。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  SCALE_LOGIN_EMAIL,
  SCALE_MEMBER_ID,
  SCALE_STAGE_CANCELLED_ID,
  SCALE_STAGE_DONE_ID,
  SCALE_USER_ID,
  SCALE_WORKSPACE_ID,
} from "./scale-data.constants.js";
import {
  cleanupScaleWorkspace,
  deleteScaleTasksForReseed,
  ensureScaleWorkspace,
  runScaleSeed,
} from "./scale-data.js";

const prisma = new PrismaClient();
const prismaDir = dirname(fileURLToPath(import.meta.url));

const TEST_TASK_ID = "99999999-9999-4999-8999-999999999990";

/** 規模シードと無関係なフィクスチャ（SCALE_* と非衝突） */
const UNRELATED_USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee01";
const UNRELATED_WORKSPACE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee02";
const UNRELATED_EMAIL = "scale-unrelated-fixture@example.com";

/**
 * SCALE 固定 ID 範囲のみを物理削除（他行は触らない）。
 * WS スコープは本番 cleanupScaleWorkspace 経由、ユーザー行のみテスト用に追加削除する。
 */
async function cleanupScaleIdsOnly(client: PrismaClient): Promise<void> {
  await cleanupScaleWorkspace(client);
  await client.$executeRawUnsafe(`DELETE FROM users WHERE id = ?`, SCALE_USER_ID);
}

async function cleanupUnrelatedFixture(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    `DELETE FROM workspaces WHERE id = ?`,
    UNRELATED_WORKSPACE_ID,
  );
  await client.$executeRawUnsafe(`DELETE FROM users WHERE id = ?`, UNRELATED_USER_ID);
}

async function createUnrelatedFixture(client: PrismaClient): Promise<void> {
  await cleanupUnrelatedFixture(client);
  await client.user.create({
    data: {
      id: UNRELATED_USER_ID,
      email: UNRELATED_EMAIL,
      name: "Unrelated Fixture",
      passwordHash: "unrelated-fixture-hash",
    },
  });
  await client.workspace.create({
    data: {
      id: UNRELATED_WORKSPACE_ID,
      name: "無関係ワークスペース",
      color: "#2563eb",
      createdByUserId: UNRELATED_USER_ID,
    },
  });
}

afterAll(async () => {
  await cleanupScaleIdsOnly(prisma);
  await cleanupUnrelatedFixture(prisma);
  await prisma.$disconnect();
});

describe("scale-data ensure + partial delete (task 2.1)", () => {
  it("ensure 後に計測ユーザー・WS・メンバー・端末段階があり、部分削除でタスクのみ 0 になる", async () => {
    await cleanupScaleIdsOnly(prisma);

    try {
      await ensureScaleWorkspace(prisma);

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: SCALE_USER_ID },
      });
      expect(user.email).toBe("scale-load@example.com");
      expect(user.deletedAt).toBeNull();

      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: SCALE_WORKSPACE_ID },
      });
      expect(workspace.createdByUserId).toBe(SCALE_USER_ID);
      expect(workspace.deletedAt).toBeNull();

      const member = await prisma.workspaceMember.findUniqueOrThrow({
        where: { id: SCALE_MEMBER_ID },
      });
      expect(member.workspaceId).toBe(SCALE_WORKSPACE_ID);
      expect(member.userId).toBe(SCALE_USER_ID);
      expect(member.deletedAt).toBeNull();

      const stages = await prisma.developmentStage.findMany({
        where: { workspaceId: SCALE_WORKSPACE_ID },
        orderBy: { order: "asc" },
      });
      expect(stages).toHaveLength(2);
      const completed = stages.find((s) => s.kind === "completed");
      const cancelled = stages.find((s) => s.kind === "cancelled");
      expect(completed?.id).toBe(SCALE_STAGE_DONE_ID);
      expect(cancelled?.id).toBe(SCALE_STAGE_CANCELLED_ID);
      expect(completed?.deletedAt).toBeNull();
      expect(cancelled?.deletedAt).toBeNull();

      await prisma.task.create({
        data: {
          id: TEST_TASK_ID,
          title: "scale-data integration probe",
          priority: "medium",
          workspaceId: SCALE_WORKSPACE_ID,
          developmentStageId: SCALE_STAGE_DONE_ID,
        },
      });
      await prisma.comment.create({
        data: {
          taskId: TEST_TASK_ID,
          authorUserId: SCALE_USER_ID,
          body: "probe comment",
        },
      });
      await prisma.activityLog.create({
        data: {
          taskId: TEST_TASK_ID,
          actorUserId: SCALE_USER_ID,
          operationType: "task_created",
        },
      });

      expect(
        await prisma.task.count({ where: { workspaceId: SCALE_WORKSPACE_ID } }),
      ).toBe(1);

      await deleteScaleTasksForReseed(prisma);

      expect(
        await prisma.task.count({ where: { workspaceId: SCALE_WORKSPACE_ID } }),
      ).toBe(0);
      expect(
        await prisma.comment.count({ where: { taskId: TEST_TASK_ID } }),
      ).toBe(0);
      expect(
        await prisma.activityLog.count({ where: { taskId: TEST_TASK_ID } }),
      ).toBe(0);

      expect(
        await prisma.user.findUnique({ where: { id: SCALE_USER_ID } }),
      ).not.toBeNull();
      expect(
        await prisma.workspace.findUnique({ where: { id: SCALE_WORKSPACE_ID } }),
      ).not.toBeNull();
      expect(
        await prisma.workspaceMember.findUnique({ where: { id: SCALE_MEMBER_ID } }),
      ).not.toBeNull();
      expect(
        await prisma.developmentStage.count({
          where: { workspaceId: SCALE_WORKSPACE_ID },
        }),
      ).toBe(2);

      // 再 ensure しても端末段階が重複せず残る
      await ensureScaleWorkspace(prisma);
      expect(
        await prisma.developmentStage.count({
          where: { workspaceId: SCALE_WORKSPACE_ID },
        }),
      ).toBe(2);
    } finally {
      await cleanupScaleIdsOnly(prisma);
    }
  });
});

describe("scale-data runScaleSeed (task 2.2)", () => {
  const TASK_COUNT = 50;

  it("指定件数を投入し再実行でも累積せず、終了予定日付き・deletedAt null・案件なし", async () => {
    await cleanupScaleIdsOnly(prisma);

    try {
      const first = await runScaleSeed({ taskCount: TASK_COUNT });

      expect(first.workspaceId).toBe(SCALE_WORKSPACE_ID);
      expect(first.userId).toBe(SCALE_USER_ID);
      expect(first.userEmail).toBe(SCALE_LOGIN_EMAIL);
      expect(first.taskCount).toBe(TASK_COUNT);
      expect(first.scheduledEndDateCount).toBeGreaterThan(0);
      expect(first.scheduledEndDateCount).toBe(Math.floor(TASK_COUNT * 0.8));

      const activeCount = await prisma.task.count({
        where: { workspaceId: SCALE_WORKSPACE_ID, deletedAt: null },
      });
      expect(activeCount).toBe(TASK_COUNT);

      const withDeletedAt = await prisma.task.count({
        where: {
          workspaceId: SCALE_WORKSPACE_ID,
          deletedAt: { not: null },
        },
      });
      expect(withDeletedAt).toBe(0);

      const withScheduledEnd = await prisma.task.count({
        where: {
          workspaceId: SCALE_WORKSPACE_ID,
          deletedAt: null,
          scheduledEndDate: { not: null },
        },
      });
      expect(withScheduledEnd).toBe(first.scheduledEndDateCount);

      const withParent = await prisma.task.count({
        where: {
          workspaceId: SCALE_WORKSPACE_ID,
          parentTaskId: { not: null },
        },
      });
      expect(withParent).toBe(0);

      const caseCount = await prisma.case.count({
        where: { workspaceId: SCALE_WORKSPACE_ID },
      });
      expect(caseCount).toBe(0);

      const second = await runScaleSeed({ taskCount: TASK_COUNT });
      expect(second.taskCount).toBe(TASK_COUNT);
      expect(
        await prisma.task.count({
          where: { workspaceId: SCALE_WORKSPACE_ID, deletedAt: null },
        }),
      ).toBe(TASK_COUNT);
    } finally {
      await cleanupScaleIdsOnly(prisma);
    }
  });
});

describe("scale-data cleanupScaleWorkspace (task 3)", () => {
  const TASK_COUNT = 20;

  it("runScaleSeed 後の掃除で WS 不在・タスク 0・ユーザー残存、再実行は removed:false", async () => {
    await cleanupScaleIdsOnly(prisma);

    try {
      await runScaleSeed({ taskCount: TASK_COUNT });
      expect(
        await prisma.task.count({
          where: { workspaceId: SCALE_WORKSPACE_ID, deletedAt: null },
        }),
      ).toBe(TASK_COUNT);

      const result = await cleanupScaleWorkspace(prisma);

      expect(result.workspaceId).toBe(SCALE_WORKSPACE_ID);
      expect(result.removed).toBe(true);

      expect(
        await prisma.workspace.findUnique({ where: { id: SCALE_WORKSPACE_ID } }),
      ).toBeNull();
      expect(
        await prisma.task.count({ where: { workspaceId: SCALE_WORKSPACE_ID } }),
      ).toBe(0);
      expect(
        await prisma.developmentStage.count({
          where: { workspaceId: SCALE_WORKSPACE_ID },
        }),
      ).toBe(0);
      expect(
        await prisma.workspaceMember.count({
          where: { workspaceId: SCALE_WORKSPACE_ID },
        }),
      ).toBe(0);
      expect(
        await prisma.user.findUnique({ where: { id: SCALE_USER_ID } }),
      ).not.toBeNull();

      const second = await cleanupScaleWorkspace(prisma);
      expect(second).toEqual({
        workspaceId: SCALE_WORKSPACE_ID,
        removed: false,
      });
      expect(
        await prisma.user.findUnique({ where: { id: SCALE_USER_ID } }),
      ).not.toBeNull();
    } finally {
      await cleanupScaleIdsOnly(prisma);
    }
  });
});

describe("scale-data integration (task 5)", () => {
  const TASK_COUNT = 50;

  it("scale-data.ts は clearAllTables を import / 呼び出さない", () => {
    const sourcePath = join(prismaDir, "scale-data.ts");
    const source = readFileSync(sourcePath, "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    const codeWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(importLines).not.toMatch(/clear-tables/);
    expect(importLines).not.toMatch(/clearAllTables/);
    expect(codeWithoutComments).not.toMatch(/\bclearAllTables\s*\(/);
  });

  it("cleanupScaleIdsOnly は cleanupScaleWorkspace 経由で WS を掃除する", () => {
    const sourcePath = join(prismaDir, "scale-data.integration.test.ts");
    const source = readFileSync(sourcePath, "utf8");
    const helperMatch = source.match(
      /async function cleanupScaleIdsOnly[\s\S]*?\n\}/,
    );
    expect(helperMatch).not.toBeNull();
    expect(helperMatch![0]).toMatch(/cleanupScaleWorkspace\s*\(/);
  });

  it("投入・掃除後も無関係ユーザー／WS が残り、SCALE WS のみ消える", async () => {
    await cleanupScaleIdsOnly(prisma);
    await createUnrelatedFixture(prisma);

    try {
      const first = await runScaleSeed({ taskCount: TASK_COUNT });
      expect(first.taskCount).toBe(TASK_COUNT);
      expect(
        await prisma.task.count({
          where: { workspaceId: SCALE_WORKSPACE_ID, deletedAt: null },
        }),
      ).toBe(TASK_COUNT);
      expect(
        await prisma.task.count({
          where: {
            workspaceId: SCALE_WORKSPACE_ID,
            deletedAt: null,
            scheduledEndDate: { not: null },
          },
        }),
      ).toBe(Math.floor(TASK_COUNT * 0.8));
      expect(
        await prisma.task.count({
          where: {
            workspaceId: SCALE_WORKSPACE_ID,
            deletedAt: { not: null },
          },
        }),
      ).toBe(0);

      expect(
        await prisma.user.findUnique({ where: { id: UNRELATED_USER_ID } }),
      ).not.toBeNull();
      expect(
        await prisma.workspace.findUnique({
          where: { id: UNRELATED_WORKSPACE_ID },
        }),
      ).not.toBeNull();

      const second = await runScaleSeed({ taskCount: TASK_COUNT });
      expect(second.taskCount).toBe(TASK_COUNT);
      expect(
        await prisma.task.count({
          where: { workspaceId: SCALE_WORKSPACE_ID, deletedAt: null },
        }),
      ).toBe(TASK_COUNT);

      const cleanup = await cleanupScaleWorkspace(prisma);
      expect(cleanup.removed).toBe(true);
      expect(
        await prisma.workspace.findUnique({ where: { id: SCALE_WORKSPACE_ID } }),
      ).toBeNull();
      expect(
        await prisma.task.count({ where: { workspaceId: SCALE_WORKSPACE_ID } }),
      ).toBe(0);

      expect(
        await prisma.user.findUnique({ where: { id: UNRELATED_USER_ID } }),
      ).not.toBeNull();
      expect(
        await prisma.workspace.findUnique({
          where: { id: UNRELATED_WORKSPACE_ID },
        }),
      ).not.toBeNull();
    } finally {
      await cleanupScaleIdsOnly(prisma);
      await cleanupUnrelatedFixture(prisma);
    }
  });
});

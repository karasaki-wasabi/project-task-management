/**
 * 手動動作確認用シードの投入本体。
 * `seed.ts` から実行され、統合テストからも直接呼べる。
 *
 * シードはマイグレーション後に新規ワークスペースを作るため、当該 WS 向けに
 * 完了種別・中止種別の段階をちょうど 1 つずつ投入する（task-status-model 1.2）。
 */
import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "@prisma/client";
import { clearAllTables } from "./clear-tables.js";

export const SEED_USER_ID = "11111111-1111-4111-8111-111111111111";
export const SEED_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
export const SEED_MEMBER_ID = "33333333-3333-4333-8333-333333333333";
export const SEED_STAGE_BACKLOG_ID = "44444444-4444-4444-8444-444444444401";
export const SEED_STAGE_DOING_ID = "44444444-4444-4444-8444-444444444402";
export const SEED_STAGE_DONE_ID = "44444444-4444-4444-8444-444444444403";
export const SEED_STAGE_CANCELLED_ID = "44444444-4444-4444-8444-444444444404";
export const SEED_CASE_ACTIVE_ID = "55555555-5555-4555-8555-555555555501";
export const SEED_CASE_DONE_ID = "55555555-5555-4555-8555-555555555502";
export const SEED_TASK_ROOT_ID = "66666666-6666-4666-8666-666666666601";
export const SEED_TASK_CHILD_ID = "66666666-6666-4666-8666-666666666602";
export const SEED_TASK_KANBAN_ID = "66666666-6666-4666-8666-666666666603";
export const SEED_TASK_DONE_ID = "66666666-6666-4666-8666-666666666604";
export const SEED_TEMPLATE_ID = "77777777-7777-4777-8777-777777777701";
export const SEED_HOLIDAY_ID = "88888888-8888-4888-8888-888888888801";

export const SEED_LOGIN_EMAIL = "root@example.com";
export const SEED_LOGIN_PASSWORD = "root@example.com";

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

export async function seedManualConfirmationData(
  prisma: PrismaClient,
): Promise<{ workspaceId: string }> {
  await clearAllTables(prisma);

  const passwordHash = await hash(SEED_LOGIN_PASSWORD);
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();

  await prisma.user.create({
    data: {
      id: SEED_USER_ID,
      email: SEED_LOGIN_EMAIL,
      name: "Root",
      passwordHash,
    },
  });

  await prisma.workspace.create({
    data: {
      id: SEED_WORKSPACE_ID,
      name: "開発用ワークスペース",
      color: "#2563eb",
      createdByUserId: SEED_USER_ID,
    },
  });

  await prisma.workspaceMember.create({
    data: {
      id: SEED_MEMBER_ID,
      workspaceId: SEED_WORKSPACE_ID,
      userId: SEED_USER_ID,
    },
  });

  await prisma.developmentStage.createMany({
    data: [
      {
        id: SEED_STAGE_BACKLOG_ID,
        name: "未着手",
        order: 0,
        kind: "normal",
        workspaceId: SEED_WORKSPACE_ID,
      },
      {
        id: SEED_STAGE_DOING_ID,
        name: "対応中",
        order: 1,
        kind: "normal",
        workspaceId: SEED_WORKSPACE_ID,
      },
      {
        id: SEED_STAGE_DONE_ID,
        name: "完了",
        order: 2,
        kind: "completed",
        workspaceId: SEED_WORKSPACE_ID,
      },
      {
        id: SEED_STAGE_CANCELLED_ID,
        name: "中止",
        order: 3,
        kind: "cancelled",
        workspaceId: SEED_WORKSPACE_ID,
      },
    ],
  });

  await prisma.case.createMany({
    data: [
      {
        id: SEED_CASE_ACTIVE_ID,
        name: "サンプル案件（進行中）",
        startDate: utcDate(year, month, Math.max(1, day - 7)),
        endDate: utcDate(year, month, Math.min(28, day + 14)),
        isCompleted: false,
        workspaceId: SEED_WORKSPACE_ID,
      },
      {
        id: SEED_CASE_DONE_ID,
        name: "サンプル案件（完了）",
        startDate: utcDate(year, month, 1),
        endDate: utcDate(year, month, Math.min(28, day)),
        isCompleted: true,
        workspaceId: SEED_WORKSPACE_ID,
      },
    ],
  });

  await prisma.recurringTaskTemplate.create({
    data: {
      id: SEED_TEMPLATE_ID,
      title: "案件開始時キックオフ",
      priority: "medium",
      caseAnchor: "case_start",
      caseOffsetDays: 0,
      defaultMemo: "シード投入の繰り返しテンプレート",
      nonBusinessDayPolicy: "next_business_day",
      isActive: true,
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  await prisma.nonBusinessDay.create({
    data: {
      id: SEED_HOLIDAY_ID,
      date: utcDate(year, 0, 1),
      label: "元日（シード）",
      source: "manual",
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: SEED_TASK_ROOT_ID,
      title: "親タスク（案件紐付け）",
      status: "in_progress",
      priority: "high",
      memo: "シード親タスク",
      caseId: SEED_CASE_ACTIVE_ID,
      isRequiredForCase: true,
      assigneeUserId: SEED_USER_ID,
      developmentStageId: SEED_STAGE_DOING_ID,
      scheduledDate: utcDate(year, month, day),
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: SEED_TASK_CHILD_ID,
      title: "子タスク",
      status: "not_started",
      priority: "medium",
      caseId: SEED_CASE_ACTIVE_ID,
      isRequiredForCase: false,
      parentTaskId: SEED_TASK_ROOT_ID,
      assigneeUserId: SEED_USER_ID,
      developmentStageId: SEED_STAGE_BACKLOG_ID,
      scheduledDate: utcDate(year, month, Math.min(28, day + 1)),
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: SEED_TASK_KANBAN_ID,
      title: "カンバン未割当タスク",
      status: "not_started",
      priority: "low",
      developmentStageId: SEED_STAGE_BACKLOG_ID,
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  // 完了段階上のタスク: status は段階内作業状態のため not_started（4.4 と整合）
  await prisma.task.create({
    data: {
      id: SEED_TASK_DONE_ID,
      title: "完了済みタスク",
      status: "not_started",
      priority: "medium",
      caseId: SEED_CASE_DONE_ID,
      isRequiredForCase: true,
      assigneeUserId: SEED_USER_ID,
      developmentStageId: SEED_STAGE_DONE_ID,
      scheduledDate: utcDate(year, month, Math.max(1, day - 2)),
      completedAt: utcDate(year, month, Math.max(1, day - 1)),
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  return { workspaceId: SEED_WORKSPACE_ID };
}

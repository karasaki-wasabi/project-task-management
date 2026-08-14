/**
 * 手動動作確認用シードの投入本体。
 * `seed.ts` から実行され、統合テストからも直接呼べる。
 *
 * シードはマイグレーション後に新規ワークスペースを作るため、当該 WS 向けに
 * 完了種別・中止種別の段階をちょうど 1 つずつ投入する（task-status-model 1.2）。
 * 消化数ダッシュボード確認用に、過去週の完了タスクとストーリーポイントも入れる
 * （velocity-dashboard）。
 */
import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "@prisma/client";
import { clearAllTables } from "./clear-tables.js";

export const SEED_USER_ID = "11111111-1111-4111-8111-111111111111";
export const SEED_USER_TANAKA_ID = "11111111-1111-4111-8111-111111111112";
export const SEED_USER_SUZUKI_ID = "11111111-1111-4111-8111-111111111113";
export const SEED_USER_SATO_ID = "11111111-1111-4111-8111-111111111114";
export const SEED_USER_YAMADA_ID = "11111111-1111-4111-8111-111111111115";
export const SEED_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
export const SEED_MEMBER_ID = "33333333-3333-4333-8333-333333333333";
export const SEED_MEMBER_TANAKA_ID = "33333333-3333-4333-8333-333333333334";
export const SEED_MEMBER_SUZUKI_ID = "33333333-3333-4333-8333-333333333335";
export const SEED_MEMBER_SATO_ID = "33333333-3333-4333-8333-333333333336";
export const SEED_MEMBER_YAMADA_ID = "33333333-3333-4333-8333-333333333337";
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
export const SEED_TASK_CHILD_SIBLING_ID = "66666666-6666-4666-8666-666666666605";
export const SEED_TASK_GRANDCHILD_ID = "66666666-6666-4666-8666-666666666606";
/** 消化数ダッシュボード確認用（過去週の完了・ポイント実績）。 */
export const SEED_TASK_VELOCITY_W1A_ID = "66666666-6666-4666-8666-666666666611";
export const SEED_TASK_VELOCITY_W1B_ID = "66666666-6666-4666-8666-666666666612";
export const SEED_TASK_VELOCITY_W2A_ID = "66666666-6666-4666-8666-666666666613";
export const SEED_TASK_VELOCITY_W2B_ID = "66666666-6666-4666-8666-666666666614";
export const SEED_TASK_VELOCITY_W3A_ID = "66666666-6666-4666-8666-666666666615";
export const SEED_TASK_VELOCITY_W3B_ID = "66666666-6666-4666-8666-666666666616";
export const SEED_TEMPLATE_ID = "77777777-7777-4777-8777-777777777701";
export const SEED_HOLIDAY_ID = "88888888-8888-4888-8888-888888888801";

export const SEED_LOGIN_EMAIL = "root@example.com";
export const SEED_LOGIN_PASSWORD = "root@example.com";

/** 開発用ワークスペースに所属する追加メンバー（ログインはメール=パスワード）。 */
export const SEED_EXTRA_MEMBERS = [
  {
    userId: SEED_USER_TANAKA_ID,
    memberId: SEED_MEMBER_TANAKA_ID,
    email: "tanaka@example.com",
    name: "田中 太郎",
  },
  {
    userId: SEED_USER_SUZUKI_ID,
    memberId: SEED_MEMBER_SUZUKI_ID,
    email: "suzuki@example.com",
    name: "鈴木 花子",
  },
  {
    userId: SEED_USER_SATO_ID,
    memberId: SEED_MEMBER_SATO_ID,
    email: "sato@example.com",
    name: "佐藤 次郎",
  },
  {
    userId: SEED_USER_YAMADA_ID,
    memberId: SEED_MEMBER_YAMADA_ID,
    email: "yamada@example.com",
    name: "山田 美咲",
  },
] as const;

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function atUtc(
  year: number,
  monthIndex: number,
  day: number,
  daysBefore: number,
  hour: number,
  minute: number,
): Date {
  const date = utcDate(year, monthIndex, day);
  date.setUTCDate(date.getUTCDate() - daysBefore);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

/** UTC 月曜始まり。throughput の期間境界と同じ。 */
function startOfWeekContainingUTC(date: Date): Date {
  const midnight = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (midnight.getUTCDay() + 6) % 7;
  midnight.setUTCDate(midnight.getUTCDate() - daysSinceMonday);
  return midnight;
}

/**
 * 完全に終わった過去週の完了時刻。
 * weeksAgo=1 は直前の週（進行中の今週は含めない）。dayOffset は月曜からの日数(0–6)。
 */
function completedInPastWeek(weeksAgo: number, dayOffset: number, hour = 12): Date {
  const start = startOfWeekContainingUTC(new Date());
  const completed = new Date(start);
  completed.setUTCDate(completed.getUTCDate() - weeksAgo * 7 + dayOffset);
  completed.setUTCHours(hour, 0, 0, 0);
  return completed;
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

  for (const member of SEED_EXTRA_MEMBERS) {
    await prisma.user.create({
      data: {
        id: member.userId,
        email: member.email,
        name: member.name,
        passwordHash: await hash(member.email),
      },
    });
  }

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

  await prisma.workspaceMember.createMany({
    data: SEED_EXTRA_MEMBERS.map((member) => ({
      id: member.memberId,
      workspaceId: SEED_WORKSPACE_ID,
      userId: member.userId,
    })),
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
      defaultDetail: "シード投入の繰り返しテンプレート",
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

  // 詳細ページの親子表示確認用: 親 → 子2件（うち1件はさらに孫を持つ）
  // 葉に storyPoints、親は合算値（サービス再計算相当をシードで直接入れる）
  await prisma.task.create({
    data: {
      id: SEED_TASK_ROOT_ID,
      title: "認証機能を実装",
      status: "in_progress",
      priority: "high",
      detail: "詳細ページで子タスクが2件並ぶ親。ログイン画面とパスワードリセットを子に持つ。",
      caseId: SEED_CASE_ACTIVE_ID,
      isRequiredForCase: true,
      assigneeUserId: SEED_USER_ID,
      developmentStageId: SEED_STAGE_DOING_ID,
      scheduledEndDate: utcDate(year, month, day),
      storyPoints: 8,
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: SEED_TASK_CHILD_ID,
      title: "ログイン画面を作る",
      status: "not_started",
      priority: "medium",
      detail: "親は「認証機能を実装」。自身の子として「バリデーションを追加」を持つ。",
      caseId: SEED_CASE_ACTIVE_ID,
      isRequiredForCase: false,
      parentTaskId: SEED_TASK_ROOT_ID,
      assigneeUserId: SEED_USER_TANAKA_ID,
      developmentStageId: SEED_STAGE_BACKLOG_ID,
      scheduledEndDate: utcDate(year, month, Math.min(28, day + 1)),
      storyPoints: 3,
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: SEED_TASK_CHILD_SIBLING_ID,
      title: "パスワードリセットを作る",
      status: "in_progress",
      priority: "medium",
      detail: "親は「認証機能を実装」。子は持たない兄弟タスク。",
      caseId: SEED_CASE_ACTIVE_ID,
      isRequiredForCase: false,
      parentTaskId: SEED_TASK_ROOT_ID,
      assigneeUserId: SEED_USER_SUZUKI_ID,
      developmentStageId: SEED_STAGE_DOING_ID,
      scheduledEndDate: utcDate(year, month, Math.min(28, day + 3)),
      storyPoints: 5,
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: SEED_TASK_GRANDCHILD_ID,
      title: "バリデーションを追加",
      status: "not_started",
      priority: "low",
      detail: "親は「ログイン画面を作る」。孫階層で親のみ表示されることを確認する。",
      caseId: SEED_CASE_ACTIVE_ID,
      isRequiredForCase: false,
      parentTaskId: SEED_TASK_CHILD_ID,
      assigneeUserId: SEED_USER_SATO_ID,
      developmentStageId: SEED_STAGE_BACKLOG_ID,
      scheduledEndDate: utcDate(year, month, Math.min(28, day + 5)),
      storyPoints: 3,
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  // 詳細ページのタイムライン日付見出し確認用（新しい順・複数日）
  await prisma.activityLog.createMany({
    data: [
      {
        taskId: SEED_TASK_ROOT_ID,
        actorUserId: SEED_USER_ID,
        operationType: "field_changed",
        fieldName: "scheduledEndDate",
        beforeValue: null,
        afterValue: utcDate(year, month, day).toISOString(),
        occurredAt: atUtc(year, month, day, 0, 1, 2),
      },
      {
        taskId: SEED_TASK_ROOT_ID,
        actorUserId: SEED_USER_ID,
        operationType: "field_changed",
        fieldName: "isRequiredForCase",
        beforeValue: "false",
        afterValue: "true",
        occurredAt: atUtc(year, month, day, 0, 0, 48),
      },
      {
        taskId: SEED_TASK_ROOT_ID,
        actorUserId: SEED_USER_ID,
        operationType: "field_changed",
        fieldName: "detail",
        beforeValue: null,
        afterValue: "updated",
        occurredAt: atUtc(year, month, day, 1, 5, 35),
      },
      {
        taskId: SEED_TASK_ROOT_ID,
        actorUserId: SEED_USER_ID,
        operationType: "field_changed",
        fieldName: "status",
        beforeValue: "not_started",
        afterValue: "in_progress",
        occurredAt: atUtc(year, month, day, 1, 0, 15),
      },
      {
        taskId: SEED_TASK_ROOT_ID,
        actorUserId: SEED_USER_ID,
        operationType: "field_changed",
        fieldName: "assignee",
        beforeValue: null,
        afterValue: SEED_USER_ID,
        occurredAt: atUtc(year, month, day, 2, 0, 12),
      },
    ],
  });

  await prisma.comment.createMany({
    data: [
      {
        taskId: SEED_TASK_ROOT_ID,
        authorUserId: SEED_USER_ID,
        body: "案件の完了条件に入れました。終了予定までにお願いします。",
        createdAt: atUtc(year, month, day, 0, 0, 45),
        updatedAt: atUtc(year, month, day, 0, 0, 45),
      },
      {
        taskId: SEED_TASK_ROOT_ID,
        authorUserId: SEED_USER_ID,
        body: "ページ分割処理が原因でした。ライブラリを上げます。",
        editedAt: atUtc(year, month, day, 1, 5, 32),
        createdAt: atUtc(year, month, day, 1, 5, 30),
        updatedAt: atUtc(year, month, day, 1, 5, 32),
      },
    ],
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
  // completedAt は直前週へ置き、進行中週の実績母数から除外されないようにする
  await prisma.task.create({
    data: {
      id: SEED_TASK_DONE_ID,
      title: "完了済みタスク",
      status: "not_started",
      priority: "medium",
      caseId: SEED_CASE_DONE_ID,
      isRequiredForCase: true,
      assigneeUserId: SEED_USER_YAMADA_ID,
      developmentStageId: SEED_STAGE_DONE_ID,
      scheduledEndDate: utcDate(year, month, Math.max(1, day - 2)),
      storyPoints: 5,
      completedAt: completedInPastWeek(1, 3),
      workspaceId: SEED_WORKSPACE_ID,
    },
  });

  // velocity-dashboard: 過去3週分の完了（件数・ポイント・フォーキャスト・案件見通し確認用）
  // 進行中案件に紐づけ、案件フィルタでも 0 以外が出るようにする
  await prisma.task.createMany({
    data: [
      {
        id: SEED_TASK_VELOCITY_W1A_ID,
        title: "消化実績: 前週のレビュー対応",
        status: "not_started",
        priority: "medium",
        caseId: SEED_CASE_ACTIVE_ID,
        isRequiredForCase: false,
        assigneeUserId: SEED_USER_TANAKA_ID,
        developmentStageId: SEED_STAGE_DONE_ID,
        storyPoints: 3,
        completedAt: completedInPastWeek(1, 1),
        workspaceId: SEED_WORKSPACE_ID,
      },
      {
        id: SEED_TASK_VELOCITY_W1B_ID,
        title: "消化実績: 前週のバグ修正",
        status: "not_started",
        priority: "high",
        caseId: SEED_CASE_ACTIVE_ID,
        isRequiredForCase: false,
        assigneeUserId: SEED_USER_SUZUKI_ID,
        developmentStageId: SEED_STAGE_DONE_ID,
        storyPoints: 5,
        completedAt: completedInPastWeek(1, 4),
        workspaceId: SEED_WORKSPACE_ID,
      },
      {
        id: SEED_TASK_VELOCITY_W2A_ID,
        title: "消化実績: 2週前のAPI実装",
        status: "not_started",
        priority: "high",
        caseId: SEED_CASE_ACTIVE_ID,
        isRequiredForCase: true,
        assigneeUserId: SEED_USER_ID,
        developmentStageId: SEED_STAGE_DONE_ID,
        storyPoints: 8,
        completedAt: completedInPastWeek(2, 2),
        workspaceId: SEED_WORKSPACE_ID,
      },
      {
        id: SEED_TASK_VELOCITY_W2B_ID,
        title: "消化実績: 2週前の文言調整",
        status: "not_started",
        priority: "low",
        caseId: SEED_CASE_ACTIVE_ID,
        isRequiredForCase: false,
        assigneeUserId: SEED_USER_SATO_ID,
        developmentStageId: SEED_STAGE_DONE_ID,
        storyPoints: 2,
        completedAt: completedInPastWeek(2, 5),
        workspaceId: SEED_WORKSPACE_ID,
      },
      {
        id: SEED_TASK_VELOCITY_W3A_ID,
        title: "消化実績: 3週前の設計メモ",
        status: "not_started",
        priority: "medium",
        caseId: SEED_CASE_ACTIVE_ID,
        isRequiredForCase: false,
        assigneeUserId: SEED_USER_YAMADA_ID,
        developmentStageId: SEED_STAGE_DONE_ID,
        storyPoints: 4,
        completedAt: completedInPastWeek(3, 1),
        workspaceId: SEED_WORKSPACE_ID,
      },
      {
        id: SEED_TASK_VELOCITY_W3B_ID,
        title: "消化実績: 3週前の調査",
        status: "not_started",
        priority: "medium",
        caseId: null,
        isRequiredForCase: false,
        assigneeUserId: SEED_USER_ID,
        developmentStageId: SEED_STAGE_DONE_ID,
        storyPoints: 6,
        completedAt: completedInPastWeek(3, 3),
        workspaceId: SEED_WORKSPACE_ID,
      },
    ],
  });

  return { workspaceId: SEED_WORKSPACE_ID };
}

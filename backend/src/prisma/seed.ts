/**
 * 手動動作確認用の開発シード。
 *
 * 既存データをすべて削除したうえで、固定アカウントと最低限の業務データを投入する。
 * E2E 実行後の汚れを捨てて手元確認用に戻す用途を想定している。
 *
 * スキーマ・制約・必須カラム・enum・リレーションが変わったら、このファイルも合わせて更新すること。
 * 運用上の注意は `.kiro/steering/local-dev-pitfalls.md` の「手動確認用シード」を参照。
 *
 * 投入後のログイン
 * - メール: root@example.com
 * - パスワード: root@example.com
 *
 * 実行例
 * - docker compose run --rm -T backend npx prisma db seed
 */
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const STAGE_BACKLOG_ID = "44444444-4444-4444-8444-444444444401";
const STAGE_DOING_ID = "44444444-4444-4444-8444-444444444402";
const STAGE_DONE_ID = "44444444-4444-4444-8444-444444444403";
const CASE_ACTIVE_ID = "55555555-5555-4555-8555-555555555501";
const CASE_DONE_ID = "55555555-5555-4555-8555-555555555502";
const TASK_ROOT_ID = "66666666-6666-4666-8666-666666666601";
const TASK_CHILD_ID = "66666666-6666-4666-8666-666666666602";
const TASK_KANBAN_ID = "66666666-6666-4666-8666-666666666603";
const TASK_DONE_ID = "66666666-6666-4666-8666-666666666604";
const TEMPLATE_ID = "77777777-7777-4777-8777-777777777701";
const HOLIDAY_ID = "88888888-8888-4888-8888-888888888801";

const LOGIN_EMAIL = "root@example.com";
const LOGIN_PASSWORD = "root@example.com";

const TABLES_IN_TRUNCATE_ORDER = [
  "tasks",
  "recurring_task_templates",
  "non_business_days",
  "development_stages",
  "cases",
  "workspace_members",
  "workspaces",
  "users",
] as const;

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

async function clearAllTables(): Promise<void> {
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES_IN_TRUNCATE_ORDER) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
}

async function main(): Promise<void> {
  await clearAllTables();

  const passwordHash = await hash(LOGIN_PASSWORD);
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();

  await prisma.user.create({
    data: {
      id: USER_ID,
      email: LOGIN_EMAIL,
      name: "Root",
      passwordHash,
    },
  });

  await prisma.workspace.create({
    data: {
      id: WORKSPACE_ID,
      name: "開発用ワークスペース",
      color: "#2563eb",
      createdByUserId: USER_ID,
    },
  });

  await prisma.workspaceMember.create({
    data: {
      id: MEMBER_ID,
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
    },
  });

  await prisma.developmentStage.createMany({
    data: [
      { id: STAGE_BACKLOG_ID, name: "未着手", order: 0, workspaceId: WORKSPACE_ID },
      { id: STAGE_DOING_ID, name: "対応中", order: 1, workspaceId: WORKSPACE_ID },
      { id: STAGE_DONE_ID, name: "完了", order: 2, workspaceId: WORKSPACE_ID },
    ],
  });

  await prisma.case.createMany({
    data: [
      {
        id: CASE_ACTIVE_ID,
        name: "サンプル案件（進行中）",
        startDate: utcDate(year, month, Math.max(1, day - 7)),
        endDate: utcDate(year, month, Math.min(28, day + 14)),
        isCompleted: false,
        workspaceId: WORKSPACE_ID,
      },
      {
        id: CASE_DONE_ID,
        name: "サンプル案件（完了）",
        startDate: utcDate(year, month, 1),
        endDate: utcDate(year, month, Math.min(28, day)),
        isCompleted: true,
        workspaceId: WORKSPACE_ID,
      },
    ],
  });

  await prisma.recurringTaskTemplate.create({
    data: {
      id: TEMPLATE_ID,
      title: "案件開始時キックオフ",
      priority: "medium",
      caseAnchor: "case_start",
      caseOffsetDays: 0,
      defaultMemo: "シード投入の繰り返しテンプレート",
      nonBusinessDayPolicy: "next_business_day",
      isActive: true,
      workspaceId: WORKSPACE_ID,
    },
  });

  await prisma.nonBusinessDay.create({
    data: {
      id: HOLIDAY_ID,
      date: utcDate(year, 0, 1),
      label: "元日（シード）",
      source: "manual",
      workspaceId: WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: TASK_ROOT_ID,
      title: "親タスク（案件紐付け）",
      status: "in_progress",
      priority: "high",
      memo: "シード親タスク",
      caseId: CASE_ACTIVE_ID,
      isRequiredForCase: true,
      assigneeUserId: USER_ID,
      developmentStageId: STAGE_DOING_ID,
      scheduledDate: utcDate(year, month, day),
      workspaceId: WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: TASK_CHILD_ID,
      title: "子タスク",
      status: "not_started",
      priority: "medium",
      caseId: CASE_ACTIVE_ID,
      isRequiredForCase: false,
      parentTaskId: TASK_ROOT_ID,
      assigneeUserId: USER_ID,
      developmentStageId: STAGE_BACKLOG_ID,
      scheduledDate: utcDate(year, month, Math.min(28, day + 1)),
      workspaceId: WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: TASK_KANBAN_ID,
      title: "カンバン未割当タスク",
      status: "not_started",
      priority: "low",
      developmentStageId: STAGE_BACKLOG_ID,
      workspaceId: WORKSPACE_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: TASK_DONE_ID,
      title: "完了済みタスク",
      status: "done",
      priority: "medium",
      caseId: CASE_DONE_ID,
      isRequiredForCase: true,
      assigneeUserId: USER_ID,
      developmentStageId: STAGE_DONE_ID,
      scheduledDate: utcDate(year, month, Math.max(1, day - 2)),
      completedAt: utcDate(year, month, Math.max(1, day - 1)),
      workspaceId: WORKSPACE_ID,
    },
  });

  console.log("手動確認用シードを投入しました。");
  console.log(`  email: ${LOGIN_EMAIL}`);
  console.log(`  password: ${LOGIN_PASSWORD}`);
  console.log(`  workspace: 開発用ワークスペース (${WORKSPACE_ID})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

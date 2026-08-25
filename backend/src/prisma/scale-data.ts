/**
 * 規模データ投入の純関数ヘルパーと、ensure / 再投入用部分削除 / 投入本体 / WS スコープ掃除。
 * soft-delete 拡張 Client・clearAllTables・seedManualConfirmationData は使わない。
 */
import { hash } from "@node-rs/argon2";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  SCALE_CREATE_MANY_CHUNK_SIZE,
  SCALE_LOGIN_EMAIL,
  SCALE_LOGIN_PASSWORD,
  SCALE_MEMBER_ID,
  SCALE_STAGE_CANCELLED_ID,
  SCALE_STAGE_DONE_ID,
  SCALE_USER_ID,
  SCALE_WORKSPACE_ID,
} from "./scale-data.constants.js";
import type {
  ScaleCleanupResult,
  ScaleSeedOptions,
  ScaleSeedResult,
} from "./scale-data.types.js";

/** 終了予定日を付与する比率（約 80%） */
export const SCALE_SCHEDULED_END_DATE_RATIO = 0.8;

const SCALE_WORKSPACE_NAME = "負荷計測用ワークスペース";
const SCALE_WORKSPACE_COLOR = "#0f766e";
const SCALE_USER_NAME = "Scale Load";

/** 終了予定日を分散させる日数幅（再現可能な決定的割当用） */
const SCHEDULED_END_DATE_SPREAD_DAYS = 90;

/**
 * SCALE_TASK_COUNT 環境変数を件数にパースする。
 * 未定義は defaultCount。空文字・非整数・0 以下は throw。
 */
export function parseScaleTaskCount(
  envValue: string | undefined,
  defaultCount: number,
): number {
  if (envValue === undefined) {
    return defaultCount;
  }

  const trimmed = envValue.trim();
  if (trimmed === "" || !/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid SCALE_TASK_COUNT: ${JSON.stringify(envValue)}. Expected a positive integer.`,
    );
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid SCALE_TASK_COUNT: ${JSON.stringify(envValue)}. Expected a positive integer.`,
    );
  }

  return parsed;
}

/**
 * 指定件数に対し、約 80% に終了予定日を割当てる（再現可能）。
 * 先頭 floor(taskCount * ratio) 件に日付を付与し、日付はインデックスで分散する。
 */
export function assignScheduledEndDates(
  taskCount: number,
  ratio: number = SCALE_SCHEDULED_END_DATE_RATIO,
  baseDate: Date = new Date(Date.UTC(2026, 0, 1)),
): Array<Date | null> {
  if (!Number.isInteger(taskCount) || taskCount < 0) {
    throw new Error(`Invalid taskCount: ${taskCount}`);
  }

  const withDateCount = Math.floor(taskCount * ratio);
  const result: Array<Date | null> = new Array(taskCount);

  for (let i = 0; i < taskCount; i++) {
    if (i < withDateCount) {
      const offsetDays = i % SCHEDULED_END_DATE_SPREAD_DAYS;
      result[i] = new Date(
        Date.UTC(
          baseDate.getUTCFullYear(),
          baseDate.getUTCMonth(),
          baseDate.getUTCDate() + offsetDays,
        ),
      );
    } else {
      result[i] = null;
    }
  }

  return result;
}

/**
 * createMany 用に配列を固定サイズのチャンクへ分割する。
 */
export function chunkArray<T>(
  items: readonly T[],
  chunkSize: number,
): T[][] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`Invalid chunkSize: ${chunkSize}`);
  }

  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize) as T[]);
  }
  return chunks;
}

/**
 * 計測ユーザー・専用 WS・メンバー・完了/中止端末段階を ensure する。
 * 全表消去しない。再実行時は既存行を再利用（upsert / 欠落時のみ作成）。
 */
export async function ensureScaleWorkspace(
  prisma: PrismaClient,
): Promise<void> {
  const passwordHash = await hash(SCALE_LOGIN_PASSWORD);

  await prisma.user.upsert({
    where: { id: SCALE_USER_ID },
    create: {
      id: SCALE_USER_ID,
      email: SCALE_LOGIN_EMAIL,
      name: SCALE_USER_NAME,
      passwordHash,
    },
    update: {
      email: SCALE_LOGIN_EMAIL,
      name: SCALE_USER_NAME,
      passwordHash,
      deletedAt: null,
    },
  });

  await prisma.workspace.upsert({
    where: { id: SCALE_WORKSPACE_ID },
    create: {
      id: SCALE_WORKSPACE_ID,
      name: SCALE_WORKSPACE_NAME,
      color: SCALE_WORKSPACE_COLOR,
      createdByUserId: SCALE_USER_ID,
    },
    update: {
      name: SCALE_WORKSPACE_NAME,
      color: SCALE_WORKSPACE_COLOR,
      createdByUserId: SCALE_USER_ID,
      deletedAt: null,
    },
  });

  await prisma.workspaceMember.upsert({
    where: { id: SCALE_MEMBER_ID },
    create: {
      id: SCALE_MEMBER_ID,
      workspaceId: SCALE_WORKSPACE_ID,
      userId: SCALE_USER_ID,
    },
    update: {
      workspaceId: SCALE_WORKSPACE_ID,
      userId: SCALE_USER_ID,
      deletedAt: null,
    },
  });

  await prisma.developmentStage.upsert({
    where: { id: SCALE_STAGE_DONE_ID },
    create: {
      id: SCALE_STAGE_DONE_ID,
      name: "完了",
      order: 0,
      kind: "completed",
      workspaceId: SCALE_WORKSPACE_ID,
    },
    update: {
      name: "完了",
      order: 0,
      kind: "completed",
      workspaceId: SCALE_WORKSPACE_ID,
      deletedAt: null,
    },
  });

  await prisma.developmentStage.upsert({
    where: { id: SCALE_STAGE_CANCELLED_ID },
    create: {
      id: SCALE_STAGE_CANCELLED_ID,
      name: "中止",
      order: 1,
      kind: "cancelled",
      workspaceId: SCALE_WORKSPACE_ID,
    },
    update: {
      name: "中止",
      order: 1,
      kind: "cancelled",
      workspaceId: SCALE_WORKSPACE_ID,
      deletedAt: null,
    },
  });
}

/**
 * 再投入用の部分削除。
 * user / WS / member / 端末段階は残し、当該 WS の activity_logs・comments・tasks のみ物理削除する。
 * cases は規模投入では作らないため通常は対象外。
 */
export async function deleteScaleTasksForReseed(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM activity_logs WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id = ?)`,
    SCALE_WORKSPACE_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id = ?)`,
    SCALE_WORKSPACE_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM tasks WHERE workspace_id = ?`,
    SCALE_WORKSPACE_ID,
  );
}

/**
 * 指定件数の規模タスクを専用 WS へ投入する。
 * ensure → 再投入用部分削除 → チャンク createMany → active 件数検証。
 * 件数不一致時は部分削除を試みたうえで throw。案件は作成しない。
 */
export async function runScaleSeed(
  options: ScaleSeedOptions,
): Promise<ScaleSeedResult> {
  const { taskCount } = options;
  if (!Number.isInteger(taskCount) || taskCount <= 0) {
    throw new Error(
      `Invalid taskCount: ${taskCount}. Expected a positive integer.`,
    );
  }

  const prisma = new PrismaClient();
  try {
    await ensureScaleWorkspace(prisma);
    await deleteScaleTasksForReseed(prisma);

    const scheduledEndDates = assignScheduledEndDates(taskCount);
    const scheduledEndDateCount = scheduledEndDates.filter(
      (d) => d !== null,
    ).length;

    const rows: Prisma.TaskCreateManyInput[] = scheduledEndDates.map(
      (scheduledEndDate, i) => ({
        title: `scale-task-${i}`,
        priority: "medium",
        workspaceId: SCALE_WORKSPACE_ID,
        parentTaskId: null,
        scheduledEndDate,
      }),
    );

    for (const chunk of chunkArray(rows, SCALE_CREATE_MANY_CHUNK_SIZE)) {
      await prisma.task.createMany({ data: chunk });
    }

    const activeCount = await prisma.task.count({
      where: { workspaceId: SCALE_WORKSPACE_ID, deletedAt: null },
    });

    if (activeCount !== taskCount) {
      try {
        await deleteScaleTasksForReseed(prisma);
      } catch {
        // 検証失敗時の掃除はベストエフォート。元の不一致を優先して報告する。
      }
      throw new Error(
        `Scale seed count mismatch: expected ${taskCount} active tasks, found ${activeCount}. Partial cleanup attempted.`,
      );
    }

    return {
      workspaceId: SCALE_WORKSPACE_ID,
      userId: SCALE_USER_ID,
      userEmail: SCALE_LOGIN_EMAIL,
      taskCount,
      scheduledEndDateCount,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 規模計測用 WS スコープの物理削除。
 * deleteScaleTasksForReseed のあと templates / holidays / stages / cases / members / workspace を削除する。
 * SCALE ユーザー行は残す。WS が既に無ければ { removed: false } を返す。
 * clearAllTables は呼ばない。
 */
export async function cleanupScaleWorkspace(
  prisma?: PrismaClient,
): Promise<ScaleCleanupResult> {
  const ownsClient = prisma === undefined;
  const client = prisma ?? new PrismaClient();

  try {
    const workspace = await client.workspace.findUnique({
      where: { id: SCALE_WORKSPACE_ID },
    });

    if (!workspace) {
      return { workspaceId: SCALE_WORKSPACE_ID, removed: false };
    }

    await deleteScaleTasksForReseed(client);

    await client.$executeRawUnsafe(
      `DELETE FROM recurring_task_templates WHERE workspace_id = ?`,
      SCALE_WORKSPACE_ID,
    );
    await client.$executeRawUnsafe(
      `DELETE FROM non_business_days WHERE workspace_id = ?`,
      SCALE_WORKSPACE_ID,
    );
    await client.$executeRawUnsafe(
      `DELETE FROM development_stages WHERE workspace_id = ?`,
      SCALE_WORKSPACE_ID,
    );
    await client.$executeRawUnsafe(
      `DELETE FROM cases WHERE workspace_id = ?`,
      SCALE_WORKSPACE_ID,
    );
    await client.$executeRawUnsafe(
      `DELETE FROM workspace_members WHERE workspace_id = ?`,
      SCALE_WORKSPACE_ID,
    );
    await client.$executeRawUnsafe(
      `DELETE FROM workspaces WHERE id = ?`,
      SCALE_WORKSPACE_ID,
    );

    return { workspaceId: SCALE_WORKSPACE_ID, removed: true };
  } finally {
    if (ownsClient) {
      await client.$disconnect();
    }
  }
}

/**
 * アプリテーブルを TRUNCATE する共通処理。
 *
 * seed（手動確認用の再投入）と E2E 実行前リセットの両方から使う。
 * テーブル追加時はここも更新すること（[[local-dev-pitfalls]] §11）。
 */
import type { PrismaClient } from "@prisma/client";

export const TABLES_IN_TRUNCATE_ORDER = [
  "tasks",
  "recurring_task_templates",
  "non_business_days",
  "development_stages",
  "cases",
  "workspace_members",
  "workspaces",
  "users",
] as const;

export async function clearAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES_IN_TRUNCATE_ORDER) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
}

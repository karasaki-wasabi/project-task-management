/**
 * 負荷計測用規模ワークスペースの掃除 CLI。
 * デモ用 db:seed とは別入口。全表消去は行わず、SCALE 専用 WS スコープのみ削除する。
 * SCALE ユーザー行は残す。計測完了後の推奨片付けは既存 db:seed。
 *
 * 実行例
 * - docker compose run --rm -T backend npm run db:cleanup-scale
 */
import { PrismaClient } from "@prisma/client";
import { SCALE_LOGIN_EMAIL } from "./scale-data.constants.js";
import { cleanupScaleWorkspace } from "./scale-data.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const result = await cleanupScaleWorkspace(prisma);

  if (result.removed) {
    console.log("規模ワークスペースを掃除しました。");
  } else {
    console.log("規模ワークスペースは既に存在しませんでした（no-op）。");
  }
  console.log(`  workspaceId: ${result.workspaceId}`);
  console.log(`  removed: ${result.removed}`);
  console.log(`  scale user retained (email: ${SCALE_LOGIN_EMAIL})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

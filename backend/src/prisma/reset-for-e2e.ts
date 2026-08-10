/**
 * E2E 実行前に共有開発 DB のアプリテーブルを空にする。
 *
 * Playwright の globalSetup から呼ぶ。シードは入れ直さない（E2E は自己登録でユーザー／WS を作る）。
 * 手元確認用データが必要なときは実行後に `prisma db seed` する。
 *
 * 実行例
 * - docker compose run --rm -T backend npx tsx src/prisma/reset-for-e2e.ts
 * - npm --prefix backend run db:reset-for-e2e
 */
import { PrismaClient } from "@prisma/client";
import { clearAllTables } from "./clear-tables.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await clearAllTables(prisma);
  console.log("E2E 用にアプリテーブルを TRUNCATE しました（シード未投入）。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

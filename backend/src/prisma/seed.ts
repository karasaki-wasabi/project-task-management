/**
 * 手動動作確認用の開発シード。
 *
 * 既存データをすべて削除したうえで、固定アカウントと最低限の業務データを投入する。
 * E2E 実行後の汚れを捨てて手元確認用に戻す用途を想定している。
 *
 * スキーマ・制約・必須カラム・enum・リレーションが変わったら、このファイルも合わせて更新すること。
 * 運用上の注意は `.kiro/steering/local-dev-pitfalls.md` の「11. 手動確認用シードとスキーマ変更の同期」を参照。
 *
 * 投入後のログイン
 * - メール: root@example.com
 * - パスワード: root@example.com
 * - 現在ワークスペースはクライアント側で自動選択される（通常は手動選択不要）
 *
 * 実行例
 * - docker compose run --rm -T backend npx prisma db seed
 */
import { PrismaClient } from "@prisma/client";
import {
  SEED_LOGIN_EMAIL,
  SEED_LOGIN_PASSWORD,
  SEED_WORKSPACE_ID,
  seedManualConfirmationData,
} from "./seed-manual-data.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedManualConfirmationData(prisma);

  console.log("手動確認用シードを投入しました。");
  console.log(`  email: ${SEED_LOGIN_EMAIL}`);
  console.log(`  password: ${SEED_LOGIN_PASSWORD}`);
  console.log(`  workspace: 開発用ワークスペース (${SEED_WORKSPACE_ID})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * 負荷計測用規模データの投入 CLI。
 * デモ用 db:seed とは別入口。全表消去は行わない。
 *
 * 環境変数
 * - SCALE_TASK_COUNT: 正の整数。未設定時は既定 6000
 *
 * 実行例
 * - docker compose run --rm -T backend npm run db:seed-scale
 * - docker compose run --rm -T -e SCALE_TASK_COUNT=50 backend npm run db:seed-scale
 */
import {
  SCALE_DEFAULT_TASK_COUNT,
  SCALE_LOGIN_PASSWORD,
} from "./scale-data.constants.js";
import { parseScaleTaskCount, runScaleSeed } from "./scale-data.js";

async function main(): Promise<void> {
  const taskCount = parseScaleTaskCount(
    process.env.SCALE_TASK_COUNT,
    SCALE_DEFAULT_TASK_COUNT,
  );
  const result = await runScaleSeed({ taskCount });

  console.log("規模データを投入しました（負荷計測専用）。");
  console.log(`  workspaceId: ${result.workspaceId}`);
  console.log(`  userId: ${result.userId}`);
  console.log(`  email: ${result.userEmail}`);
  console.log(
    `  password: ${SCALE_LOGIN_PASSWORD} (load-test / local DB only)`,
  );
  console.log(`  taskCount: ${result.taskCount}`);
  console.log(`  scheduledEndDateCount: ${result.scheduledEndDateCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

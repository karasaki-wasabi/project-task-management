/**
 * Playwright スイート開始時に、共有開発 MySQL を空にする。
 *
 * 前回 E2E の残留データがキャップ付き一覧やカレンダー週レーンを圧迫するのを防ぐ。
 * スキップ: E2E_SKIP_DB_RESET=1
 * 前提: docker compose の mysql / backend イメージが使えること
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_SKIP_DB_RESET === "1") {
    console.log("[e2e globalSetup] E2E_SKIP_DB_RESET=1 — DB リセットをスキップします");
    return;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  console.log("[e2e globalSetup] 共有 MySQL を TRUNCATE しています...");
  execFileSync(
    "docker",
    ["compose", "run", "--rm", "-T", "backend", "npx", "tsx", "src/prisma/reset-for-e2e.ts"],
    { cwd: repoRoot, stdio: "inherit" },
  );
}

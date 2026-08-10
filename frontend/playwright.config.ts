// Playwright E2E config (task 12.1-12.3, design.md Testing Strategy
// "E2E/UI Tests"). design.md/research.md do not name an E2E tool; Playwright
// is chosen here as the de facto standard for Nuxt/Vue apps (documented in
// tasks.md Implementation Notes). Tests assume the backend (+ MySQL) and
// frontend are already running via `docker compose up` — this config does
// NOT start them itself, since the backend requires a database that
// Playwright's `webServer` option cannot provision.
//
// Setup (once): `npx playwright install --with-deps chromium`
// Run: `npm run test:e2e` (equivalent to `playwright test`)
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // 共有開発 DB / 1 本の API・フロントに対して並列ワーカーを走らせると
  // タイムアウトが散発する。隔離と安定性のため既定は 1。
  workers: 1,
  // 前回実行の残留データを捨ててからスイートを開始する（E2E_SKIP_DB_RESET=1 で無効化可）。
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    headless: true,
    // Wider than Playwright's 1280x720 default: the kanban board scrolls
    // horizontally within its own container (see e2e/drag.ts), so this
    // just needs to be comfortably usable, not wide enough to fit every
    // column at once.
    viewport: { width: 1600, height: 1000 },
  },
});


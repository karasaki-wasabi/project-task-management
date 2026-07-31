import { defineConfig } from "vitest/config";

// `npm run test` (vitest) must not collect the Playwright specs under
// e2e/** (task 12.1-12.7) — they call test()/expect() from
// @playwright/test, which vitest's default glob otherwise picks up and
// fails to load.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});

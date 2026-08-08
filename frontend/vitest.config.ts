import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// `npm run test` (vitest) must not collect the Playwright specs under
// e2e/** (task 12.1-12.7) — they call test()/expect() from
// @playwright/test, which vitest's default glob otherwise picks up and
// fails to load.
//
// Vue SFC component tests (task 6.1+) use @vue/test-utils + happy-dom.
// Helper-only unit tests remain compatible with the same config.
//
// `as never`: Nuxt pulls Vite 8 plugin types; vitest 3 still types against its
// nested Vite 7 copy. Runtime is fine; this silences the defineConfig mismatch.
export default defineConfig({
  plugins: [vue() as never],
  test: {
    environment: "happy-dom",
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});

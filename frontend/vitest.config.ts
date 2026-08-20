import { defineVitestConfig } from "@nuxt/test-utils/config";

// `npm run test` (vitest) must not collect the Playwright specs under
// e2e/** — they call test()/expect() from @playwright/test, which
// vitest's default glob otherwise picks up and fails to load.
//
// `environment: "nuxt"` boots a real Nuxt app per test file so
// auto-imported composables/components/utils resolve the same way they
// do in the actual app, instead of requiring every SFC to explicitly
// import them just for tests to mount.
//
// `buildDir` is redirected away from the app's own `.nuxt/` so vitest's
// Nuxt build artifacts never collide with `nuxt dev`/`nuxt build`'s.
export default defineVitestConfig({
  test: {
    environment: "nuxt",
    exclude: ["**/node_modules/**", "**/e2e/**"],
    environmentOptions: {
      nuxt: {
        overrides: {
          buildDir: ".nuxt-vitest",
        },
      },
    },
  },
});

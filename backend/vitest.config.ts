import { defineConfig } from "vitest/config";

// Integration tests across this backend hit one real, shared MySQL database
// (shared/db.ts) with no per-test transaction rollback — there's no
// isolation between test files. Vitest's default file-level parallelism
// (separate worker processes/threads per file) let two files' tests race
// on the same rows concurrently: a `hardDelete` in one file's test could run
// mid-flight of another file's `db.task.create`, producing intermittent
// foreign-key-violation / unique-constraint failures that have nothing to
// do with the code under test (confirmed via task-delivery-management
// validate-impl: re-running the exact same suite with file parallelism
// disabled cut failures roughly in half, all of the eliminated ones were
// cross-file FK/unique-constraint races). Disabling file parallelism trades
// some wall-clock time for a suite that reports the same result every run.
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});

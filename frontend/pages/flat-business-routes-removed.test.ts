import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** workspace-url-routing 3.3: old flat business pages must be gone (404 at runtime). */
const pagesDir = join(dirname(fileURLToPath(import.meta.url)));

const removedFlatDirs = [
  "tasks",
  "kanban",
  "cases",
  "calendar",
  "recurrence",
  "holidays",
  "throughput",
] as const;

describe("flat business routes removed (workspace-url-routing 3.3)", () => {
  it.each(removedFlatDirs)("pages/%s が存在しない", (dir) => {
    expect(existsSync(join(pagesDir, dir))).toBe(false);
  });
});

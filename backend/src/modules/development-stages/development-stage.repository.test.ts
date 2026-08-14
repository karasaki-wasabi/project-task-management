// developmentStageRepository module-boundary-cleanup 4.2 source guard.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("developmentStageRepository module boundary (module-boundary-cleanup task 4.2)", () => {
  it("does not update task persistence (Requirements 1.1, 1.3, 1.4, 4.6)", () => {
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), "development-stage.repository.ts");
    const source = readFileSync(sourcePath, "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    const codeWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(importLines).not.toMatch(/from ["']\.\.\/tasks\//);
    expect(codeWithoutComments).not.toMatch(/\b(?:db|tx|client)\.task\b/);
    expect(codeWithoutComments).not.toMatch(/task\.updateMany/);
  });
});

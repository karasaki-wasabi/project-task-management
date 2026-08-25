import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(prismaDir, "../..");
const packageJsonPath = join(backendRoot, "package.json");

describe("db:seed-scale / db:cleanup-scale scripts (task 4)", () => {
  it("package.json にデモ db:seed とは別の両 script がある", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["db:seed"]).toBeDefined();
    expect(pkg.scripts?.["db:seed-scale"]).toBe(
      "tsx src/prisma/seed-scale.ts",
    );
    expect(pkg.scripts?.["db:cleanup-scale"]).toBe(
      "tsx src/prisma/cleanup-scale.ts",
    );
    expect(pkg.scripts?.["db:seed-scale"]).not.toBe(pkg.scripts?.["db:seed"]);
  });

  it("seed-scale.ts と cleanup-scale.ts が存在する", () => {
    expect(existsSync(join(prismaDir, "seed-scale.ts"))).toBe(true);
    expect(existsSync(join(prismaDir, "cleanup-scale.ts"))).toBe(true);
  });
});

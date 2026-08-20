import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type SourceFiles = Record<string, string>;

type CrossModuleRepositoryImport = {
  from: string;
  specifier: string;
};

type TaskClosureLeak = {
  from: string;
  specifier: string;
};

type StagesTaskServiceImport = {
  from: string;
  specifier: string;
};

type BoundaryFindings = {
  crossModuleRepositoryImports: CrossModuleRepositoryImport[];
  serviceCycles: string[][];
  taskClosureLeaks: TaskClosureLeak[];
  stagesTaskServiceImports: StagesTaskServiceImport[];
};

function isProductionSourcePath(filePath: string): boolean {
  return filePath.endsWith(".ts") && !filePath.includes(".test.");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function extractSpecifiers(source: string): string[] {
  const stripped = stripComments(source);
  const specifiers: string[] = [];
  for (const re of [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g]) {
    for (const match of stripped.matchAll(re)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function moduleOf(filePath: string): string | null {
  const parts = filePath.split("/");
  const index = parts.indexOf("modules");
  if (index === -1 || index + 1 >= parts.length) return null;
  return parts[index + 1] ?? null;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  return posix.normalize(posix.join(posix.dirname(fromFile), specifier));
}

function toTsPath(resolvedJs: string): string {
  return resolvedJs.endsWith(".js") ? `${resolvedJs.slice(0, -3)}.ts` : resolvedJs;
}

function isExactBasename(resolved: string, basename: string): boolean {
  return resolved === basename || resolved.endsWith(`/${basename}`);
}

function findServiceCycles(edges: Array<[string, string]>): string[][] {
  const graph = new Map<string, string[]>();
  for (const [from, to] of edges) {
    const next = graph.get(from) ?? [];
    next.push(to);
    graph.set(from, next);
    if (!graph.has(to)) graph.set(to, []);
  }

  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): void {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      dfs(next);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }
  return cycles;
}

function analyzeModuleBoundary(files: SourceFiles): BoundaryFindings {
  const findings: BoundaryFindings = {
    crossModuleRepositoryImports: [],
    serviceCycles: [],
    taskClosureLeaks: [],
    stagesTaskServiceImports: [],
  };
  const serviceEdges: Array<[string, string]> = [];

  for (const [from, source] of Object.entries(files)) {
    if (!isProductionSourcePath(from)) continue;
    const fromModule = moduleOf(from);
    for (const specifier of extractSpecifiers(source)) {
      const resolved = resolveSpecifier(from, specifier);
      if (!resolved) continue;
      const toModule = moduleOf(resolved);

      if (resolved.endsWith(".repository.js") && fromModule && toModule && fromModule !== toModule) {
        findings.crossModuleRepositoryImports.push({ from, specifier });
      }

      if (resolved.endsWith(".service.js") && fromModule && toModule && fromModule !== toModule) {
        serviceEdges.push([from, toTsPath(resolved)]);
      }

      if (isExactBasename(resolved, "task.closure.js") && fromModule !== "tasks") {
        findings.taskClosureLeaks.push({ from, specifier });
      }

      if (fromModule === "development-stages" && isExactBasename(resolved, "task.service.js")) {
        findings.stagesTaskServiceImports.push({ from, specifier });
      }
    }
  }

  findings.serviceCycles = findServiceCycles(serviceEdges);
  return findings;
}

const srcDir = dirname(fileURLToPath(import.meta.url));

function loadProductionModuleFiles(): SourceFiles {
  const files: SourceFiles = {};
  const modulesDir = join(srcDir, "modules");

  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith(".ts") || name.includes(".test.")) continue;
      const relativePath = relative(srcDir, full).split(sep).join("/");
      files[relativePath] = readFileSync(full, "utf8");
    }
  }

  walk(modulesDir);
  return files;
}

describe("module-boundary.guard ", () => {
  describe("異なるモジュールのリポジトリのインポート (Requirements 1.2, 1.3, 7.2)", () => {
    it("本番ファイルが別のモジュールのリポジトリをインポートすると失敗する", () => {
      const findings = analyzeModuleBoundary({
        "modules/cases/case.service.ts":
          'import { taskRepository } from "../tasks/task.repository.js";\n',
      });
      expect(findings.crossModuleRepositoryImports).toEqual([
        {
          from: "modules/cases/case.service.ts",
          specifier: "../tasks/task.repository.js",
        },
      ]);
    });

    it("型のみのインポートが別のモジュールのリポジトリを指すと失敗する", () => {
      const findings = analyzeModuleBoundary({
        "modules/recurrence/recurrence.service.ts":
          'import type { TaskRow } from "../tasks/task.repository.js";\n',
      });
      expect(findings.crossModuleRepositoryImports).toEqual([
        {
          from: "modules/recurrence/recurrence.service.ts",
          specifier: "../tasks/task.repository.js",
        },
      ]);
    });

    it("同じモジュールのリポジトリのインポートはフラグ付けしない", () => {
      const findings = analyzeModuleBoundary({
        "modules/cases/case.service.ts":
          'import { caseRepository } from "./case.repository.js";\n',
      });
      expect(findings.crossModuleRepositoryImports).toEqual([]);
    });

    it("shared/soft-delete.repository のインポートはフラグ付けしない", () => {
      const findings = analyzeModuleBoundary({
        "modules/cases/case.service.ts":
          'import type { DbClient } from "../../shared/soft-delete.repository.js";\n',
      });
      expect(findings.crossModuleRepositoryImports).toEqual([]);
    });

    it("コメントアウトされたリポジトリのインポートは違反として扱わない", () => {
      const findings = analyzeModuleBoundary({
        "modules/cases/case.service.ts":
          '// import { taskRepository } from "../tasks/task.repository.js";\n',
      });
      expect(findings.crossModuleRepositoryImports).toEqual([]);
    });
  });

  describe("異なるモジュールのサービスの循環 (Requirements 2.1, 2.3)", () => {
    it("2つのモジュールのサービスの循環が失敗する", () => {
      const findings = analyzeModuleBoundary({
        "modules/tasks/task.service.ts":
          'import { developmentStagesService } from "../development-stages/development-stage.service.js";\n',
        "modules/development-stages/development-stage.service.ts":
          'import { tasksService } from "../tasks/task.service.js";\n',
      });
      expect(findings.serviceCycles.length).toBeGreaterThan(0);
      const joined = findings.serviceCycles.map((cycle) => cycle.join(" -> "));
      expect(joined.some((cycle) => cycle.includes("task.service") && cycle.includes("development-stage.service"))).toBe(
        true,
      );
    });

    it("より長い異なるモジュールのサービスの循環が失敗する", () => {
      const findings = analyzeModuleBoundary({
        "modules/tasks/task.service.ts": 'import { caseService } from "../cases/case.service.js";\n',
        "modules/cases/case.service.ts":
          'import { recurrenceService } from "../recurrence/recurrence.service.js";\n',
        "modules/recurrence/recurrence.service.ts":
          'import { tasksService } from "../tasks/task.service.js";\n',
      });
      expect(findings.serviceCycles.length).toBeGreaterThan(0);
    });

    it("同じモジュールのサービスのインポートは循環としてフラグ付けしない", () => {
      const findings = analyzeModuleBoundary({
        "modules/tasks/task.service.ts":
          'import { taskIntegrityService } from "./task-integrity.service.js";\n',
        "modules/tasks/task-integrity.service.ts":
          'import { tasksService } from "./task.service.js";\n',
      });
      expect(findings.serviceCycles).toEqual([]);
    });

    it("case-read と task-integrity を非循環な公開面として許可", () => {
      const findings = analyzeModuleBoundary({
        "modules/cases/case.service.ts": [
          'import { recurrenceService } from "../recurrence/recurrence.service.js";',
          'import { taskIntegrityService } from "../tasks/task-integrity.service.js";',
        ].join("\n"),
        "modules/cases/case-read.service.ts": "",
        "modules/recurrence/recurrence.service.ts": [
          'import { caseReadService } from "../cases/case-read.service.js";',
          'import { taskIntegrityService } from "../tasks/task-integrity.service.js";',
          'import { tasksService } from "../tasks/task.service.js";',
        ].join("\n"),
        "modules/tasks/task.service.ts": [
          'import { caseReadService } from "../cases/case-read.service.js";',
          'import { developmentStagesService } from "../development-stages/development-stage.service.js";',
          'import { taskIntegrityService } from "./task-integrity.service.js";',
        ].join("\n"),
        "modules/tasks/task-integrity.service.ts": "",
        "modules/development-stages/development-stage.service.ts":
          'import { taskIntegrityService } from "../tasks/task-integrity.service.js";\n',
      });
      expect(findings.serviceCycles).toEqual([]);
    });
  });

  describe("task.closure (Requirements 1.3, 7.2)", () => {
    it("task.closure が tasks 以外からインポートされると失敗する", () => {
      const findings = analyzeModuleBoundary({
        "modules/cases/case.repository.ts":
          'import { openTaskFilter } from "../tasks/task.closure.js";\n',
      });
      expect(findings.taskClosureLeaks).toEqual([
        {
          from: "modules/cases/case.repository.ts",
          specifier: "../tasks/task.closure.js",
        },
      ]);
    });

    it("task.closure が tasks 内部からインポートされると許可される", () => {
      const findings = analyzeModuleBoundary({
        "modules/tasks/task-integrity.service.ts":
          'import { completedTaskFilter } from "./task.closure.js";\n',
      });
      expect(findings.taskClosureLeaks).toEqual([]);
    });
  });

  describe("development-stages は task.service をインポートしてはいけない (Requirements 2.1, 2.3)", () => {
    it("development-stages が task.service.js をインポートすると失敗する", () => {
      const findings = analyzeModuleBoundary({
        "modules/development-stages/development-stage.service.ts":
          'import { tasksService } from "../tasks/task.service.js";\n',
      });
      expect(findings.stagesTaskServiceImports).toEqual([
        {
          from: "modules/development-stages/development-stage.service.ts",
          specifier: "../tasks/task.service.js",
        },
      ]);
    });

    it("development-stages が task-integrity.service.js をインポートすると許可される", () => {
      const findings = analyzeModuleBoundary({
        "modules/development-stages/development-stage.service.ts":
          'import { taskIntegrityService } from "../tasks/task-integrity.service.js";\n',
      });
      expect(findings.stagesTaskServiceImports).toEqual([]);
    });
  });

  describe("production modules (Requirements 1.2, 1.3, 2.1, 2.3, 7.2)", () => {
    it("Requirement 1 の直接参照も異なるモジュールのサービスの循環もない", () => {
      const findings = analyzeModuleBoundary(loadProductionModuleFiles());
      expect(findings.crossModuleRepositoryImports).toEqual([]);
      expect(findings.serviceCycles).toEqual([]);
      expect(findings.taskClosureLeaks).toEqual([]);
      expect(findings.stagesTaskServiceImports).toEqual([]);
    });
  });
});

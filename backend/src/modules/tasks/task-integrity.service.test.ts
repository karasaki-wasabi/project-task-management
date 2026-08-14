// taskIntegrityService (module-boundary-cleanup task 2.3; design.md
// Backend/tasks taskIntegrityService; Requirements 1.1, 1.4, 2.1, 2.2, 3.2,
// 4.1, 4.2, 4.3, 4.5, 4.6).
// Mirrors existing detach / progress / throughput / generated-task list semantics.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { CaseRelativeAnchor as PrismaCaseRelativeAnchor } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import type { CaseRelativeAnchor } from "../recurrence/recurrence.types.js";
import {
  type GeneratedTaskAnchor,
  taskIntegrityService,
} from "./task-integrity.service.js";

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

const GENERATED_TASK_ANCHORS: GeneratedTaskAnchor[] = [
  "case_start",
  "case_end",
  "period_month_start",
  "period_month_end",
];

let workspaceA: VerifiedWorkspaceId;
let workspaceB: VerifiedWorkspaceId;
let userId: string;

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("task-integrity-ws") });
  userId = user.id;
  const [a, b] = await Promise.all([
    db.workspace.create({ data: { name: `task-integrity-a-${randomUUID()}`, createdByUserId: userId } }),
    db.workspace.create({ data: { name: `task-integrity-b-${randomUUID()}`, createdByUserId: userId } }),
  ]);
  workspaceA = asVerified(a.id);
  workspaceB = asVerified(b.id);
});

afterAll(async () => {
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDelete("users", [userId]);
  await db.$disconnect();
});

describe("taskIntegrityService (module-boundary-cleanup 2.3)", () => {
  it("GeneratedTaskAnchor value set equals CaseRelativeAnchor (Requirement 4.6; design GeneratedTaskAnchor)", () => {
    const fromPrisma = Object.values(PrismaCaseRelativeAnchor) as CaseRelativeAnchor[];
    const fromRecurrenceTypeSamples: CaseRelativeAnchor[] = [
      "case_start",
      "case_end",
      "period_month_start",
      "period_month_end",
    ];

    expect(new Set(GENERATED_TASK_ANCHORS)).toEqual(new Set(fromPrisma));
    expect(new Set(GENERATED_TASK_ANCHORS)).toEqual(new Set(fromRecurrenceTypeSamples));
  });

  it("does not import developmentStages / case / recurrence services (Requirement 1.1, 2.1, 2.2)", () => {
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), "task-integrity.service.ts");
    const source = readFileSync(sourcePath, "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    expect(importLines).not.toMatch(/development-stage\.service/);
    expect(importLines).not.toMatch(/developmentStagesService/);
    expect(importLines).not.toMatch(/case\.service/);
    expect(importLines).not.toMatch(/caseService/);
    expect(importLines).not.toMatch(/case-read\.service/);
    expect(importLines).not.toMatch(/caseReadService/);
    expect(importLines).not.toMatch(/recurrence\.service/);
    expect(importLines).not.toMatch(/recurrenceService/);
    // design.md #### taskIntegrityService: taskRepository + task.closure only
    // (no direct db.task / client.task Prisma access).
    expect(importLines).toMatch(/from "\.\/task\.repository\.js"/);
    expect(importLines).toMatch(/from "\.\/task\.closure\.js"/);
    const codeWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(codeWithoutComments).not.toMatch(/\b(?:db|client)\.task\b/);
  });

  it("detachFromCase nulls caseId by case id only and leaves the task (Requirement 4.1)", async () => {
    const caseRow = await db.case.create({
      data: {
        name: `detach-${randomUUID()}`,
        endDate: new Date("2036-01-01"),
        workspaceId: workspaceA,
      },
    });
    const linked = await db.task.create({
      data: {
        title: "keep me",
        priority: "low",
        caseId: caseRow.id,
        workspaceId: workspaceA,
      },
    });

    await taskIntegrityService.detachFromCase(caseRow.id);

    const surviving = await db.task.findUnique({ where: { id: linked.id } });
    expect(surviving).not.toBeNull();
    expect(surviving?.caseId).toBeNull();

    await hardDelete("tasks", [linked.id]);
    await hardDelete("cases", [caseRow.id]);
  });

  it("detachFromCase updates by caseId only (no workspace filter; Requirement 4.1, 4.6)", async () => {
    // Same caseId shape as current case.repository.delete: where: { caseId } only.
    const caseRow = await db.case.create({
      data: {
        name: `detach-id-only-${randomUUID()}`,
        endDate: new Date("2036-01-02"),
        workspaceId: workspaceA,
      },
    });
    // Task in another workspace still sharing caseId is unrealistic via FK, but
    // the where clause must remain ID-only (no workspaceId in updateMany).
    const linked = await db.task.create({
      data: {
        title: "id-only detach",
        priority: "low",
        caseId: caseRow.id,
        workspaceId: workspaceA,
      },
    });

    await taskIntegrityService.detachFromCase(caseRow.id);

    expect((await db.task.findUnique({ where: { id: linked.id } }))?.caseId).toBeNull();

    await hardDelete("tasks", [linked.id]);
    await hardDelete("cases", [caseRow.id]);
  });

  it("detachFromCase sees uncommitted rows via the TX client (Requirement 3.2)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const caseRow = await tx.case.create({
          data: {
            name: `detach-tx-${randomUUID()}`,
            endDate: new Date("2036-01-03"),
            workspaceId: workspaceA,
          },
        });
        const linked = await tx.task.create({
          data: {
            title: "tx detach",
            priority: "low",
            caseId: caseRow.id,
            workspaceId: workspaceA,
          },
        });

        await taskIntegrityService.detachFromCase(caseRow.id, tx);

        const inside = await tx.task.findUnique({ where: { id: linked.id } });
        expect(inside?.caseId).toBeNull();

        throw new Error("rollback-detach-tx-proof");
      }),
    ).rejects.toThrow("rollback-detach-tx-proof");
  });

  it("clearDevelopmentStage nulls developmentStageId by stage id only (Requirement 4.3)", async () => {
    const stage = await db.developmentStage.create({
      data: {
        name: `clear-stage-${randomUUID()}`,
        order: 10,
        kind: "normal",
        workspaceId: workspaceA,
      },
    });
    const linked = await db.task.create({
      data: {
        title: "stage ref",
        priority: "low",
        developmentStageId: stage.id,
        workspaceId: workspaceA,
      },
    });

    await taskIntegrityService.clearDevelopmentStage(stage.id);

    const surviving = await db.task.findUnique({ where: { id: linked.id } });
    expect(surviving).not.toBeNull();
    expect(surviving?.developmentStageId).toBeNull();

    await hardDelete("tasks", [linked.id]);
    await hardDelete("development_stages", [stage.id]);
  });

  it("clearDevelopmentStage sees uncommitted rows via the TX client (Requirement 3.2)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const stage = await tx.developmentStage.create({
          data: {
            name: `clear-tx-${randomUUID()}`,
            order: 11,
            kind: "normal",
            workspaceId: workspaceA,
          },
        });
        const linked = await tx.task.create({
          data: {
            title: "tx clear",
            priority: "low",
            developmentStageId: stage.id,
            workspaceId: workspaceA,
          },
        });

        await taskIntegrityService.clearDevelopmentStage(stage.id, tx);

        const inside = await tx.task.findUnique({ where: { id: linked.id } });
        expect(inside?.developmentStageId).toBeNull();

        throw new Error("rollback-clear-tx-proof");
      }),
    ).rejects.toThrow("rollback-clear-tx-proof");
  });

  it("countRequiredForCaseProgress matches open∪completed / completed filters (Requirement 4.2)", async () => {
    const caseRow = await db.case.create({
      data: {
        name: `progress-${randomUUID()}`,
        endDate: new Date("2036-02-01"),
        workspaceId: workspaceA,
      },
    });
    const [completedStage, cancelledStage] = await Promise.all([
      db.developmentStage.create({
        data: {
          name: `completed-${randomUUID()}`,
          order: 900,
          kind: "completed",
          workspaceId: workspaceA,
        },
      }),
      db.developmentStage.create({
        data: {
          name: `cancelled-${randomUUID()}`,
          order: 901,
          kind: "cancelled",
          workspaceId: workspaceA,
        },
      }),
    ]);
    const taskIds: string[] = [];
    const stageIds = [completedStage.id, cancelledStage.id];

    try {
      for (let i = 0; i < 3; i++) {
        const task = await db.task.create({
          data: {
            title: `required completed ${i}`,
            priority: "low",
            caseId: caseRow.id,
            isRequiredForCase: true,
            developmentStageId: completedStage.id,
            workspaceId: workspaceA,
          },
        });
        taskIds.push(task.id);
      }
      const openTask = await db.task.create({
        data: {
          title: "required open",
          priority: "low",
          caseId: caseRow.id,
          isRequiredForCase: true,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(openTask.id);
      const cancelledTask = await db.task.create({
        data: {
          title: "required cancelled",
          priority: "low",
          caseId: caseRow.id,
          isRequiredForCase: true,
          developmentStageId: cancelledStage.id,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(cancelledTask.id);
      const optional = await db.task.create({
        data: {
          title: "optional done",
          priority: "low",
          caseId: caseRow.id,
          isRequiredForCase: false,
          developmentStageId: completedStage.id,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(optional.id);

      const counts = await taskIntegrityService.countRequiredForCaseProgress(caseRow.id, workspaceA);
      expect(counts).toEqual({ requiredTotal: 4, requiredCompleted: 3 });
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("development_stages", stageIds);
      await hardDelete("cases", [caseRow.id]);
    }
  });

  it("countRequiredForCaseProgress scopes by workspace (Requirement 1.4, 4.2)", async () => {
    const caseRow = await db.case.create({
      data: {
        name: `progress-scope-${randomUUID()}`,
        endDate: new Date("2036-02-02"),
        workspaceId: workspaceA,
      },
    });
    const inScope = await db.task.create({
      data: {
        title: "in workspace",
        priority: "low",
        caseId: caseRow.id,
        isRequiredForCase: true,
        workspaceId: workspaceA,
      },
    });
    // Cross-workspace task with same caseId cannot be created under normal FK
    // if case is workspace-scoped; create a sibling case+task in B and ensure
    // counting workspaceA does not pick it up via workspace filter.
    const caseB = await db.case.create({
      data: {
        name: `progress-scope-b-${randomUUID()}`,
        endDate: new Date("2036-02-03"),
        workspaceId: workspaceB,
      },
    });
    const otherWs = await db.task.create({
      data: {
        title: "other workspace",
        priority: "low",
        caseId: caseB.id,
        isRequiredForCase: true,
        workspaceId: workspaceB,
      },
    });

    const counts = await taskIntegrityService.countRequiredForCaseProgress(caseRow.id, workspaceA);
    expect(counts).toEqual({ requiredTotal: 1, requiredCompleted: 0 });

    await hardDelete("tasks", [inScope.id, otherWs.id]);
    await hardDelete("cases", [caseRow.id, caseB.id]);
  });

  it("countCompletedInPeriodIncludingDeleted includes soft-deleted tasks (Requirement 4.5)", async () => {
    const periodStart = new Date("2024-01-01T00:00:00.000Z");
    const periodEnd = new Date("2024-01-07T23:59:59.999Z");
    const inPeriod = await db.task.create({
      data: {
        title: `throughput-${randomUUID()}`,
        priority: "low",
        completedAt: new Date("2024-01-03T09:00:00.000Z"),
        workspaceId: workspaceA,
      },
    });
    const outside = await db.task.create({
      data: {
        title: `throughput-out-${randomUUID()}`,
        priority: "low",
        completedAt: new Date("2024-01-10T09:00:00.000Z"),
        workspaceId: workspaceA,
      },
    });

    expect(await taskIntegrityService.countCompletedInPeriodIncludingDeleted(periodStart, periodEnd)).toBe(1);

    await db.task.delete({ where: { id: inPeriod.id } });

    expect(await taskIntegrityService.countCompletedInPeriodIncludingDeleted(periodStart, periodEnd)).toBe(1);

    await hardDelete("tasks", [inPeriod.id, outside.id]);
  });

  it("listGeneratedByAnchors returns id/workspaceId for matching sourceAnchor (Requirement 1.4, 4.6)", async () => {
    const caseRow = await db.case.create({
      data: {
        name: `gen-list-${randomUUID()}`,
        endDate: new Date("2036-03-01"),
        workspaceId: workspaceA,
      },
    });
    const startTask = await db.task.create({
      data: {
        title: "generated start",
        priority: "low",
        caseId: caseRow.id,
        sourceAnchor: "case_start",
        workspaceId: workspaceA,
      },
    });
    const endTask = await db.task.create({
      data: {
        title: "generated end",
        priority: "low",
        caseId: caseRow.id,
        sourceAnchor: "case_end",
        workspaceId: workspaceA,
      },
    });
    const manual = await db.task.create({
      data: {
        title: "manual",
        priority: "low",
        caseId: caseRow.id,
        sourceAnchor: null,
        workspaceId: workspaceA,
      },
    });

    const listed = await taskIntegrityService.listGeneratedByAnchors(caseRow.id, ["case_start"]);
    expect(listed).toEqual([{ id: startTask.id, workspaceId: workspaceA }]);

    const both = await taskIntegrityService.listGeneratedByAnchors(caseRow.id, [
      "case_start",
      "case_end",
    ]);
    expect(new Set(both.map((t) => t.id))).toEqual(new Set([startTask.id, endTask.id]));
    expect(both.every((t) => t.workspaceId === workspaceA)).toBe(true);
    expect(both.some((t) => t.id === manual.id)).toBe(false);

    await hardDelete("tasks", [startTask.id, endTask.id, manual.id]);
    await hardDelete("cases", [caseRow.id]);
  });

  it("listGeneratedByAnchors sees uncommitted rows via the TX client (Requirement 3.2)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const caseRow = await tx.case.create({
          data: {
            name: `gen-tx-${randomUUID()}`,
            endDate: new Date("2036-03-02"),
            workspaceId: workspaceA,
          },
        });
        const generated = await tx.task.create({
          data: {
            title: "tx generated",
            priority: "low",
            caseId: caseRow.id,
            sourceAnchor: "period_month_start",
            workspaceId: workspaceA,
          },
        });

        const inside = await taskIntegrityService.listGeneratedByAnchors(
          caseRow.id,
          ["period_month_start"],
          tx,
        );
        expect(inside).toEqual([{ id: generated.id, workspaceId: workspaceA }]);

        const outside = await taskIntegrityService.listGeneratedByAnchors(caseRow.id, [
          "period_month_start",
        ]);
        expect(outside).toEqual([]);

        throw new Error("rollback-list-tx-proof");
      }),
    ).rejects.toThrow("rollback-list-tx-proof");
  });
});

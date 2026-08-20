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
  it("GeneratedTaskAnchor の値セットが CaseRelativeAnchor と一致することを確認 (Requirement 4.6; design GeneratedTaskAnchor)", () => {
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

  it("developmentStages / case / recurrence サービスをインポートしないことを確認 (Requirement 1.1, 2.1, 2.2)", () => {
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

  it("taskIntegrityService.detachFromCase で caseId をクリアし、タスクを残す (Requirement 4.1)", async () => {
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

  it("taskIntegrityService.detachFromCase で caseId のみで更新し、ワークスペースフィルターなし (Requirement 4.1, 4.6)", async () => {
    const caseRow = await db.case.create({
      data: {
        name: `detach-id-only-${randomUUID()}`,
        endDate: new Date("2036-01-02"),
        workspaceId: workspaceA,
      },
    });
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

  it("taskIntegrityService.detachFromCase で未コミットの行を TX クライアントで参照する (Requirement 3.2)", async () => {
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

  it("taskIntegrityService.clearDevelopmentStage で developmentStageId をクリアし、段階を残す (Requirement 4.3)", async () => {
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

  it("taskIntegrityService.clearDevelopmentStage で未コミットの行を TX クライアントで参照する (Requirement 3.2)", async () => {
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

  it("taskIntegrityService.countRequiredForCaseProgress で open∪completed と completed のフィルターに一致するタスク数をカウント (Requirement 4.2)", async () => {
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

  it("taskIntegrityService.countRequiredForCaseProgress でワークスペーススコープを適用 (Requirement 1.4, 4.2)", async () => {
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

  it("taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted で削除されたタスクを含む (Requirement 4.5)", async () => {
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

    expect(
      await taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted(
        periodStart,
        periodEnd,
        workspaceA,
      ),
    ).toEqual({ count: 1, points: 0 });

    await db.task.delete({ where: { id: inPeriod.id } });

    expect(
      await taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted(
        periodStart,
        periodEnd,
        workspaceA,
      ),
    ).toEqual({ count: 1, points: 0 });

    await hardDelete("tasks", [inPeriod.id, outside.id]);
  });

  it("taskIntegrityService.listGeneratedByAnchors で sourceAnchor に一致する id/workspaceId を返す (Requirement 1.4, 4.6)", async () => {
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

  it("taskIntegrityService.listGeneratedByAnchors で未コミットの行を TX クライアントで参照する (Requirement 3.2)", async () => {
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

describe("taskIntegrityService aggregation (velocity-dashboard 1.3)", () => {
  const periodStart = new Date("2025-06-01T00:00:00.000Z");
  const periodEnd = new Date("2025-06-07T23:59:59.999Z");
  const inPeriod = new Date("2025-06-03T12:00:00.000Z");

  it("countCompletedWithPoints includes parents in count but only leaves in points (Requirement 3.3, 3.5)", async () => {
    const parent = await db.task.create({
      data: {
        title: `agg-parent-${randomUUID()}`,
        priority: "low",
        completedAt: inPeriod,
        storyPoints: 8,
        workspaceId: workspaceA,
      },
    });
    const leafChild = await db.task.create({
      data: {
        title: `agg-leaf-${randomUUID()}`,
        priority: "low",
        completedAt: inPeriod,
        storyPoints: 5,
        parentTaskId: parent.id,
        workspaceId: workspaceA,
      },
    });
    const leafUnset = await db.task.create({
      data: {
        title: `agg-unset-${randomUUID()}`,
        priority: "low",
        completedAt: inPeriod,
        storyPoints: null,
        workspaceId: workspaceA,
      },
    });

    try {
      const result = await taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted(
        periodStart,
        periodEnd,
        workspaceA,
      );
      expect(result.count).toBe(3);
      expect(result.points).toBe(5);
    } finally {
      await hardDelete("tasks", [leafChild.id, leafUnset.id, parent.id]);
    }
  });

  it("countCompletedWithPoints scopes by workspace and optional caseId (Requirement 3.1, 4.2)", async () => {
    const caseA = await db.case.create({
      data: {
        name: `agg-case-a-${randomUUID()}`,
        endDate: new Date("2036-06-01"),
        workspaceId: workspaceA,
      },
    });
    const caseB = await db.case.create({
      data: {
        name: `agg-case-b-${randomUUID()}`,
        endDate: new Date("2036-06-02"),
        workspaceId: workspaceB,
      },
    });
    const inCaseA = await db.task.create({
      data: {
        title: "in case A",
        priority: "low",
        completedAt: inPeriod,
        storyPoints: 3,
        caseId: caseA.id,
        workspaceId: workspaceA,
      },
    });
    const otherCaseInA = await db.task.create({
      data: {
        title: "other case in A",
        priority: "low",
        completedAt: inPeriod,
        storyPoints: 7,
        workspaceId: workspaceA,
      },
    });
    const otherWs = await db.task.create({
      data: {
        title: "other workspace",
        priority: "low",
        completedAt: inPeriod,
        storyPoints: 99,
        caseId: caseB.id,
        workspaceId: workspaceB,
      },
    });

    try {
      const wholeWs = await taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted(
        periodStart,
        periodEnd,
        workspaceA,
      );
      expect(wholeWs).toEqual({ count: 2, points: 10 });

      const filtered = await taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted(
        periodStart,
        periodEnd,
        workspaceA,
        caseA.id,
      );
      expect(filtered).toEqual({ count: 1, points: 3 });

      const otherOnly = await taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted(
        periodStart,
        periodEnd,
        workspaceB,
      );
      expect(otherOnly).toEqual({ count: 1, points: 99 });
    } finally {
      await hardDelete("tasks", [inCaseA.id, otherCaseInA.id, otherWs.id]);
      await hardDelete("cases", [caseA.id, caseB.id]);
    }
  });

  it("countCompletedWithPoints keeps soft-deleted completed in count and points (Requirement 3.2)", async () => {
    const leaf = await db.task.create({
      data: {
        title: `agg-soft-${randomUUID()}`,
        priority: "low",
        completedAt: inPeriod,
        storyPoints: 4,
        workspaceId: workspaceA,
      },
    });

    try {
      await db.task.delete({ where: { id: leaf.id } });

      const result = await taskIntegrityService.countCompletedWithPointsInPeriodIncludingDeleted(
        periodStart,
        periodEnd,
        workspaceA,
      );
      expect(result).toEqual({ count: 1, points: 4 });
    } finally {
      await hardDelete("tasks", [leaf.id]);
    }
  });

  it("countOpenTasksWithPoints counts all open tasks but sums leaf points only (Requirement 7.1)", async () => {
    const caseRow = await db.case.create({
      data: {
        name: `open-agg-${randomUUID()}`,
        endDate: new Date("2036-07-01"),
        workspaceId: workspaceA,
      },
    });
    const [completedStage, cancelledStage] = await Promise.all([
      db.developmentStage.create({
        data: {
          name: `open-agg-done-${randomUUID()}`,
          order: 910,
          kind: "completed",
          workspaceId: workspaceA,
        },
      }),
      db.developmentStage.create({
        data: {
          name: `open-agg-cancel-${randomUUID()}`,
          order: 911,
          kind: "cancelled",
          workspaceId: workspaceA,
        },
      }),
    ]);

    const openParent = await db.task.create({
      data: {
        title: "open parent",
        priority: "low",
        caseId: caseRow.id,
        storyPoints: 10,
        workspaceId: workspaceA,
      },
    });
    const openLeaf = await db.task.create({
      data: {
        title: "open leaf child",
        priority: "low",
        caseId: caseRow.id,
        parentTaskId: openParent.id,
        storyPoints: 3,
        workspaceId: workspaceA,
      },
    });
    const openSiblingLeaf = await db.task.create({
      data: {
        title: "open sibling leaf",
        priority: "low",
        caseId: caseRow.id,
        storyPoints: 2,
        workspaceId: workspaceA,
      },
    });
    const completedLeaf = await db.task.create({
      data: {
        title: "completed leaf",
        priority: "low",
        caseId: caseRow.id,
        storyPoints: 50,
        developmentStageId: completedStage.id,
        workspaceId: workspaceA,
      },
    });
    const cancelledLeaf = await db.task.create({
      data: {
        title: "cancelled leaf",
        priority: "low",
        caseId: caseRow.id,
        storyPoints: 40,
        developmentStageId: cancelledStage.id,
        workspaceId: workspaceA,
      },
    });

    try {
      const result = await taskIntegrityService.countOpenTasksWithPoints(workspaceA, caseRow.id);
      expect(result.count).toBe(3);
      expect(result.points).toBe(5);
    } finally {
      await hardDelete("tasks", [
        openLeaf.id,
        openSiblingLeaf.id,
        completedLeaf.id,
        cancelledLeaf.id,
        openParent.id,
      ]);
      await hardDelete("development_stages", [completedStage.id, cancelledStage.id]);
      await hardDelete("cases", [caseRow.id]);
    }
  });

  it("countOpenTasksWithPoints excludes soft-deleted open tasks (Requirement 7.1)", async () => {
    const caseRow = await db.case.create({
      data: {
        name: `open-soft-${randomUUID()}`,
        endDate: new Date("2036-07-02"),
        workspaceId: workspaceA,
      },
    });
    const active = await db.task.create({
      data: {
        title: "active open",
        priority: "low",
        caseId: caseRow.id,
        storyPoints: 1,
        workspaceId: workspaceA,
      },
    });
    const softDeleted = await db.task.create({
      data: {
        title: "soft open",
        priority: "low",
        caseId: caseRow.id,
        storyPoints: 9,
        workspaceId: workspaceA,
      },
    });

    try {
      await db.task.delete({ where: { id: softDeleted.id } });

      const result = await taskIntegrityService.countOpenTasksWithPoints(workspaceA, caseRow.id);
      expect(result).toEqual({ count: 1, points: 1 });
    } finally {
      await hardDelete("tasks", [active.id, softDeleted.id]);
      await hardDelete("cases", [caseRow.id]);
    }
  });

  it("taskIntegrityService から古い countCompletedInPeriodIncludingDeleted を削除 (Requirement 3.1)", async () => {
    expect(taskIntegrityService).not.toHaveProperty("countCompletedInPeriodIncludingDeleted");
  });
});

// caseService workspace scope (workspace-resource-scope task 2.1;
// Requirements 1.1, 1.2, 3.1, 3.2, 3.3) plus prior CaseService coverage.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../shared/db.js";
import { createLogger } from "../../shared/logger.js";
import { setBusinessEventLoggerForTests } from "../../shared/business-event-logger.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import { recurrenceService } from "../recurrence/recurrence.service.js";
import { caseService } from "./case.service.js";

/** Isolate non-apply tests from active templates in the shared DB (omit = full apply). */
const noApply = { templateOperations: [] as const };

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

/** Physical delete of all tasks for a case (active + soft-deleted) so RESTRICT FK allows case cleanup. */
async function hardDeleteTasksForCase(caseId: string): Promise<void> {
  await db.$executeRawUnsafe(`DELETE FROM tasks WHERE case_id = ?`, caseId);
}

function collectingStream() {
  const lines: Record<string, unknown>[] = [];
  let buffer = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          lines.push(JSON.parse(line));
        }
      }
      callback();
    },
  });
  return { stream, lines };
}

let lines: Record<string, unknown>[];
let workspaceA: VerifiedWorkspaceId;
let workspaceB: VerifiedWorkspaceId;
let userId: string;

function findEvent(event: string): Record<string, unknown> | undefined {
  return lines.find((l) => l.event === event);
}

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("case-svc-ws") });
  userId = user.id;
  const [a, b] = await Promise.all([
    db.workspace.create({ data: { name: `case-svc-a-${randomUUID()}`, createdByUserId: userId } }),
    db.workspace.create({ data: { name: `case-svc-b-${randomUUID()}`, createdByUserId: userId } }),
  ]);
  workspaceA = asVerified(a.id);
  workspaceB = asVerified(b.id);
});

beforeEach(() => {
  const collected = collectingStream();
  lines = collected.lines;
  setBusinessEventLoggerForTests(createLogger("debug", collected.stream));
});

afterAll(async () => {
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDelete("users", [userId]);
  await db.$disconnect();
});

describe("caseService.create (task 3.2 + workspace-resource-scope 2.1)", () => {
  it("creates a case holding name/startDate/endDate in the given workspace (Requirement 1.1, 2.2, 2.3)", async () => {
    const startDate = new Date("2036-09-01");
    const endDate = new Date("2036-09-30");
    const created = await caseService.create({
      name: "case A",
      startDate,
      endDate,
      workspaceId: workspaceA,
      ...noApply,
    });

    expect(created.name).toBe("case A");
    expect(created.startDate?.getTime()).toBe(startDate.getTime());
    expect(created.endDate.getTime()).toBe(endDate.getTime());
    expect(created.workspaceId).toBe(workspaceA);

    await hardDelete("cases", [created.id]);
  });

  it("rejects an empty name (Requirement 2.3)", async () => {
    await expect(
      caseService.create({ name: "  ", endDate: new Date("2036-01-01"), workspaceId: workspaceA, ...noApply }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects startDate later than endDate (Requirement 2.4)", async () => {
    await expect(
      caseService.create({
        name: "bad range",
        startDate: new Date("2036-05-10"),
        endDate: new Date("2036-05-01"),
        workspaceId: workspaceA,
        ...noApply,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("allows creating without a startDate", async () => {
    const created = await caseService.create({
      name: "no start",
      endDate: new Date("2036-11-01"),
      workspaceId: workspaceA,
      ...noApply,
    });

    expect(created.startDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("succeeds with only endDate provided (no startDate)", async () => {
    const created = await caseService.create({
      name: "only end",
      endDate: new Date("2036-11-02"),
      workspaceId: workspaceA,
      ...noApply,
    });

    expect(created.startDate).toBeNull();
    expect(created.endDate?.getTime()).toBe(new Date("2036-11-02").getTime());

    await hardDelete("cases", [created.id]);
  });

  it("succeeds with only startDate provided (no endDate)", async () => {
    const created = await caseService.create({
      name: "only start",
      startDate: new Date("2036-11-03"),
      workspaceId: workspaceA,
      ...noApply,
    });

    expect(created.startDate?.getTime()).toBe(new Date("2036-11-03").getTime());
    expect(created.endDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("succeeds with neither startDate nor endDate provided", async () => {
    const created = await caseService.create({ name: "no dates at all", workspaceId: workspaceA, ...noApply });

    expect(created.startDate).toBeNull();
    expect(created.endDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("defaults isCompleted to false and does not accept it as input (Requirement 2.5)", async () => {
    const created = await caseService.create({
      name: "fresh case",
      endDate: new Date("2036-12-01"),
      workspaceId: workspaceA,
      ...noApply,
    });

    expect(created.isCompleted).toBe(false);

    await hardDelete("cases", [created.id]);
  });

  it("logs case.created with the requestId and the new case's id (Requirement 10.2 pattern)", async () => {
    let caseId: string | undefined;
    try {
      const created = await caseService.create(
        { name: `logged-${randomUUID()}`, endDate: new Date("2037-01-01"), workspaceId: workspaceA, ...noApply },
        "req-case-create",
      );
      caseId = created.id;

      const logged = findEvent("case.created");
      expect(logged?.entityId).toBe(created.id);
      expect(logged?.requestId).toBe("req-case-create");
    } finally {
      if (caseId) await hardDelete("cases", [caseId]);
    }
  });
});

describe("caseService.update (task 3.2 + workspace-resource-scope 2.1)", () => {
  it("updates isCompleted alone without touching dates (Requirement 5.1, 5.4)", async () => {
    const startDate = new Date("2036-01-01");
    const endDate = new Date("2036-01-31");
    const created = await caseService.create({
      name: "toggle only",
      startDate,
      endDate,
      workspaceId: workspaceA,
      ...noApply,
    });

    const updated = await caseService.update(created.id, workspaceA, { isCompleted: true, ...noApply });

    expect(updated.isCompleted).toBe(true);
    expect(updated.startDate?.getTime()).toBe(startDate.getTime());
    expect(updated.endDate.getTime()).toBe(endDate.getTime());

    await hardDelete("cases", [created.id]);
  });

  it("updates name alone", async () => {
    const created = await caseService.create({
      name: "old name",
      endDate: new Date("2036-02-01"),
      workspaceId: workspaceA,
      ...noApply,
    });

    const updated = await caseService.update(created.id, workspaceA, { name: "new name", ...noApply });

    expect(updated.name).toBe("new name");

    await hardDelete("cases", [created.id]);
  });

  it("clears startDate independently via null", async () => {
    const created = await caseService.create({
      name: "clearable",
      startDate: new Date("2036-03-01"),
      endDate: new Date("2036-03-31"),
      workspaceId: workspaceA,
      ...noApply,
    });

    const updated = await caseService.update(created.id, workspaceA, { startDate: null, ...noApply });

    expect(updated.startDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("rejects a resulting startDate later than endDate, merging with the currently-persisted value (Requirement 5.3)", async () => {
    const created = await caseService.create({
      name: "merge check",
      startDate: new Date("2036-04-01"),
      endDate: new Date("2036-04-30"),
      workspaceId: workspaceA,
      ...noApply,
    });

    await expect(
      caseService.update(created.id, workspaceA, { endDate: new Date("2036-03-01"), ...noApply }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    await hardDelete("cases", [created.id]);
  });

  it("returns not_found (404) when updating a non-existent case", async () => {
    await expect(
      caseService.update(randomUUID(), workspaceA, { name: "ghost", ...noApply }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns not_found (404) when updating a case in another workspace (Requirement 3.3)", async () => {
    const created = await caseService.create({
      name: "other workspace case",
      endDate: new Date("2036-04-15"),
      workspaceId: workspaceB,
      ...noApply,
    });

    await expect(
      caseService.update(created.id, workspaceA, { name: "hijack", ...noApply }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    await hardDelete("cases", [created.id]);
  });

  it("sets only endDate when the case currently has no startDate, without triggering the ordering check", async () => {
    const created = await caseService.create({ name: "no start yet", workspaceId: workspaceA, ...noApply });

    const updated = await caseService.update(created.id, workspaceA, {
      endDate: new Date("2036-09-05"),
      ...noApply,
    });

    expect(updated.startDate).toBeNull();
    expect(updated.endDate?.getTime()).toBe(new Date("2036-09-05").getTime());

    await hardDelete("cases", [created.id]);
  });

  it("rejects updating endDate to before the persisted startDate even when the case was created without an endDate (merge-validation)", async () => {
    const created = await caseService.create({
      name: "merge from unset endDate",
      startDate: new Date("2026-01-01"),
      workspaceId: workspaceA,
      ...noApply,
    });

    await expect(
      caseService.update(created.id, workspaceA, { endDate: new Date("2025-12-01"), ...noApply }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    await hardDelete("cases", [created.id]);
  });

  it("clears endDate to null while startDate remains set, without triggering the ordering check", async () => {
    const created = await caseService.create({
      name: "clear end only",
      startDate: new Date("2036-09-10"),
      endDate: new Date("2036-09-20"),
      workspaceId: workspaceA,
      ...noApply,
    });

    const updated = await caseService.update(created.id, workspaceA, { endDate: null, ...noApply });

    expect(updated.startDate?.getTime()).toBe(new Date("2036-09-10").getTime());
    expect(updated.endDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });
});

describe("caseService.getProgress (task 3.2 + workspace-resource-scope 2.1)", () => {
  it("returns isOverdueWithIncomplete=false when isCompleted=true even though endDate is in the past and required tasks are incomplete (Requirement 6.2)", async () => {
    const created = await caseService.create({
      name: "past but done",
      endDate: new Date("2000-01-01"),
      workspaceId: workspaceA,
      ...noApply,
    });
    const openTask = await db.task.create({
      data: {
        title: "still open",
        priority: "low",
        caseId: created.id,
        isRequiredForCase: true,
        workspaceId: workspaceA,
      },
    });
    await caseService.update(created.id, workspaceA, { isCompleted: true, ...noApply });

    const progress = await caseService.getProgress(created.id, workspaceA);

    expect(progress.requiredIncomplete).toBe(1);
    expect(progress.isOverdueWithIncomplete).toBe(false);

    await hardDelete("tasks", [openTask.id]);
    await hardDelete("cases", [created.id]);
  });

  it("returns isOverdueWithIncomplete=true when not completed, endDate is past, and required tasks incomplete (Requirement 6.1)", async () => {
    const created = await caseService.create({
      name: "overdue",
      endDate: new Date("2000-01-01"),
      workspaceId: workspaceA,
      ...noApply,
    });
    const openTask = await db.task.create({
      data: {
        title: "still open",
        priority: "low",
        caseId: created.id,
        isRequiredForCase: true,
        workspaceId: workspaceA,
      },
    });

    const progress = await caseService.getProgress(created.id, workspaceA);

    expect(progress.requiredTotal).toBe(1);
    expect(progress.requiredCompleted).toBe(0);
    expect(progress.requiredIncomplete).toBe(1);
    expect(progress.isOverdueWithIncomplete).toBe(true);

    await hardDelete("tasks", [openTask.id]);
    await hardDelete("cases", [created.id]);
  });

  it("returns isOverdueWithIncomplete=false when endDate is unset even though not completed and required tasks are incomplete (Requirement 6.3)", async () => {
    const created = await caseService.create({ name: "no end date", workspaceId: workspaceA, ...noApply });
    const openTask = await db.task.create({
      data: {
        title: "still open",
        priority: "low",
        caseId: created.id,
        isRequiredForCase: true,
        workspaceId: workspaceA,
      },
    });

    const progress = await caseService.getProgress(created.id, workspaceA);

    expect(progress.requiredIncomplete).toBe(1);
    expect(progress.isOverdueWithIncomplete).toBe(false);

    await hardDelete("tasks", [openTask.id]);
    await hardDelete("cases", [created.id]);
  });

  it("returns not_found (404) for progress of a non-existent case", async () => {
    await expect(caseService.getProgress(randomUUID(), workspaceA)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns not_found (404) for progress of a case in another workspace (Requirement 3.3)", async () => {
    const created = await caseService.create({
      name: "progress other ws",
      endDate: new Date("2036-05-01"),
      workspaceId: workspaceB,
      ...noApply,
    });

    await expect(caseService.getProgress(created.id, workspaceA)).rejects.toMatchObject({ statusCode: 404 });

    await hardDelete("cases", [created.id]);
  });

  it("excludes cancelled required tasks from overdue and denominator (task-status-model 3.4; Requirements 6.2, 6.4, 6.5)", async () => {
    const created = await caseService.create({
      name: "overdue with cancel",
      endDate: new Date("2000-01-01"),
      workspaceId: workspaceA,
      ...noApply,
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
    // 5 required: 3 completed, 1 open, 1 cancelled → total 4, incomplete 1 → overdue.
    const taskIds: string[] = [];
    const stageIds = [completedStage.id, cancelledStage.id];
    try {
      for (let i = 0; i < 3; i++) {
        const task = await db.task.create({
          data: {
            title: `completed ${i}`,
            priority: "low",
            caseId: created.id,
            isRequiredForCase: true,
            developmentStageId: completedStage.id,
            workspaceId: workspaceA,
          },
        });
        taskIds.push(task.id);
      }
      const openTask = await db.task.create({
        data: {
          title: "still open",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: true,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(openTask.id);
      const cancelledTask = await db.task.create({
        data: {
          title: "cancelled required",
          priority: "low",
          caseId: created.id,
          isRequiredForCase: true,
          developmentStageId: cancelledStage.id,
          workspaceId: workspaceA,
        },
      });
      taskIds.push(cancelledTask.id);

      const progress = await caseService.getProgress(created.id, workspaceA);

      expect(progress.requiredTotal).toBe(4);
      expect(progress.requiredCompleted).toBe(3);
      expect(progress.requiredIncomplete).toBe(1);
      expect(progress.isOverdueWithIncomplete).toBe(true);
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("development_stages", stageIds);
      await hardDelete("cases", [created.id]);
    }
  });

  it("does not present progress and is not overdue when all required tasks are cancelled (task-status-model 3.4; Requirements 6.4, 6.5, 6.6)", async () => {
    const created = await caseService.create({
      name: "all cancelled",
      endDate: new Date("2000-01-01"),
      workspaceId: workspaceA,
      ...noApply,
    });
    const cancelledStage = await db.developmentStage.create({
      data: {
        name: `cancelled-${randomUUID()}`,
        order: 901,
        kind: "cancelled",
        workspaceId: workspaceA,
      },
    });
    const taskIds: string[] = [];
    try {
      for (let i = 0; i < 2; i++) {
        const task = await db.task.create({
          data: {
            title: `cancelled ${i}`,
            priority: "low",
            caseId: created.id,
            isRequiredForCase: true,
            developmentStageId: cancelledStage.id,
            workspaceId: workspaceA,
          },
        });
        taskIds.push(task.id);
      }

      const progress = await caseService.getProgress(created.id, workspaceA);

      // Denominator 0: no progress to present; cancelled cannot trigger overdue (6.4, 6.6).
      expect(progress.requiredTotal).toBe(0);
      expect(progress.requiredCompleted).toBe(0);
      expect(progress.requiredIncomplete).toBe(0);
      expect(progress.isOverdueWithIncomplete).toBe(false);
    } finally {
      await hardDelete("tasks", taskIds);
      await hardDelete("development_stages", [cancelledStage.id]);
      await hardDelete("cases", [created.id]);
    }
  });
});

describe("caseService.delete / list (task 3.2 + workspace-resource-scope 2.1)", () => {
  it("detaches linked tasks and removes the case, logging case.deleted (Requirement 8.1, 8.2)", async () => {
    const created = await caseService.create({
      name: "to delete",
      endDate: new Date("2036-06-01"),
      workspaceId: workspaceA,
      ...noApply,
    });
    const linkedTask = await db.task.create({
      data: { title: "keep me", priority: "low", caseId: created.id, workspaceId: workspaceA },
    });

    await caseService.delete(created.id, workspaceA, "req-case-delete");

    const list = await caseService.list(workspaceA);
    expect(list.some((c) => c.id === created.id)).toBe(false);

    const survivingTask = await db.task.findUnique({ where: { id: linkedTask.id } });
    expect(survivingTask?.caseId).toBeNull();

    const logged = findEvent("case.deleted");
    expect(logged?.entityId).toBe(created.id);
    expect(logged?.requestId).toBe("req-case-delete");

    await hardDelete("tasks", [linkedTask.id]);
    await hardDelete("cases", [created.id]);
  });

  it("returns not_found (404) when deleting a non-existent case", async () => {
    await expect(caseService.delete(randomUUID(), workspaceA)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns not_found (404) when deleting a case in another workspace (Requirement 3.3)", async () => {
    const created = await caseService.create({
      name: "delete other ws",
      endDate: new Date("2036-06-15"),
      workspaceId: workspaceB,
      ...noApply,
    });

    await expect(caseService.delete(created.id, workspaceA)).rejects.toMatchObject({ statusCode: 404 });

    await hardDelete("cases", [created.id]);
  });

  it("list returns only cases in the current workspace (Requirement 3.1)", async () => {
    const inA = await caseService.create({
      name: `list-a-${randomUUID()}`,
      workspaceId: workspaceA,
      ...noApply,
    });
    const inB = await caseService.create({
      name: `list-b-${randomUUID()}`,
      workspaceId: workspaceB,
      ...noApply,
    });

    const listA = await caseService.list(workspaceA);
    expect(listA.some((c) => c.id === inA.id)).toBe(true);
    expect(listA.some((c) => c.id === inB.id)).toBe(false);

    await hardDelete("cases", [inA.id, inB.id]);
  });
});

describe("caseService module boundary (module-boundary-cleanup task 4.1)", () => {
  it("orchestrates progress and delete via taskIntegrityService (Requirements 1.1, 1.4, 4.1, 4.2, 4.6)", () => {
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), "case.service.ts");
    const source = readFileSync(sourcePath, "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    const codeWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(importLines).toMatch(/task-integrity\.service/);
    expect(importLines).toMatch(/taskIntegrityService/);
    expect(importLines).not.toMatch(/task\.closure/);
    expect(codeWithoutComments).toMatch(/taskIntegrityService\.countRequiredForCaseProgress/);
    expect(codeWithoutComments).toMatch(/taskIntegrityService\.detachFromCase/);
    expect(codeWithoutComments).not.toMatch(/countRequiredTasks/);
    expect(codeWithoutComments).not.toMatch(/countRequiredCompletedTasks/);
  });
});

describe("caseService templateOperations + same-TX apply (task 4, Requirements 3.2–3.4, 3.6, 4.3, 4.13)", () => {
  // Recurrence/Task workspace scoping lands in later tasks; these tests assert
  // CaseService's orchestration contract (ops resolution + TX) via apply mocks.
  it("create with both dates (omit templateOperations) calls applyToCase with full generate ops (Requirements 3.4, 3.6)", async () => {
    const spy = vi.spyOn(recurrenceService, "applyToCase").mockResolvedValueOnce(undefined);
    let caseId: string | undefined;
    try {
      const created = await caseService.create({
        name: `t4-both-${randomUUID()}`,
        startDate: new Date("2036-06-01T00:00:00.000Z"),
        endDate: new Date("2036-06-15T00:00:00.000Z"),
        workspaceId: workspaceA,
      });
      caseId = created.id;

      expect(spy).toHaveBeenCalledWith(
        created.id,
        expect.arrayContaining(["start_generate", "end_generate", "month_generate"]),
        expect.any(String),
        expect.anything(),
      );
    } finally {
      spy.mockRestore();
      if (caseId) {
        await hardDeleteTasksForCase(caseId);
        await hardDelete("cases", [caseId]);
      }
    }
  });

  it("create rejects templateOperations that are not a subset of full candidates with 400", async () => {
    await expect(
      caseService.create({
        name: `t4-bad-ops-${randomUUID()}`,
        startDate: new Date("2036-06-01T00:00:00.000Z"),
        endDate: new Date("2036-06-15T00:00:00.000Z"),
        workspaceId: workspaceA,
        templateOperations: ["start_delete"],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("apply failure rolls back the case row (same TX; Requirements 3.6, 4.3)", async () => {
    const name = `t4-rollback-${randomUUID()}`;
    const spy = vi.spyOn(recurrenceService, "applyToCase").mockRejectedValueOnce(new Error("forced apply failure"));
    try {
      await expect(
        caseService.create({
          name,
          startDate: new Date("2036-06-01T00:00:00.000Z"),
          endDate: new Date("2036-06-15T00:00:00.000Z"),
          workspaceId: workspaceA,
        }),
      ).rejects.toThrow("forced apply failure");

      const leftover = await db.case.findMany({ where: { name } });
      expect(leftover).toHaveLength(0);
    } finally {
      spy.mockRestore();
      const leftover = await db.case.findMany({ where: { name } });
      if (leftover.length > 0) {
        for (const row of leftover) await hardDeleteTasksForCase(row.id);
        await hardDelete(
          "cases",
          leftover.map((c) => c.id),
        );
      }
    }
  });

  it("update with templateOperations: [] changes dates only and calls apply with empty ops (Requirement 4.13)", async () => {
    const spy = vi.spyOn(recurrenceService, "applyToCase").mockResolvedValue(undefined);
    let caseId: string | undefined;
    try {
      const created = await caseService.create({
        name: `t4-empty-ops-case-${randomUUID()}`,
        startDate: new Date("2036-07-01T00:00:00.000Z"),
        endDate: new Date("2036-07-10T00:00:00.000Z"),
        workspaceId: workspaceA,
        templateOperations: ["end_generate"],
      });
      caseId = created.id;
      spy.mockClear();

      const updated = await caseService.update(created.id, workspaceA, {
        endDate: new Date("2036-07-20T00:00:00.000Z"),
        templateOperations: [],
      });
      expect(updated.endDate?.toISOString().slice(0, 10)).toBe("2036-07-20");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      if (caseId) {
        await hardDeleteTasksForCase(caseId);
        await hardDelete("cases", [caseId]);
      }
    }
  });

  it("create with startDate only (omit) calls applyToCase with start_generate only (Requirement 3.2)", async () => {
    const spy = vi.spyOn(recurrenceService, "applyToCase").mockResolvedValueOnce(undefined);
    let caseId: string | undefined;
    try {
      const created = await caseService.create({
        name: `t4-start-only-case-${randomUUID()}`,
        startDate: new Date("2036-08-10T00:00:00.000Z"),
        workspaceId: workspaceA,
      });
      caseId = created.id;

      expect(spy).toHaveBeenCalledWith(created.id, ["start_generate"], expect.any(String), expect.anything());
    } finally {
      spy.mockRestore();
      if (caseId) {
        await hardDeleteTasksForCase(caseId);
        await hardDelete("cases", [caseId]);
      }
    }
  });
});

// RED: caseService does not exist yet (task 3.2, design.md "Backend/cases"
// CaseService, Requirements 2.3, 2.4, 2.5, 5.3, 5.4, 6.1, 6.2, 8.1, 8.2).
// Integration test against real MySQL via shared/db.ts (this project's
// testing steering: no mocking of the DB layer), mirroring
// deliveries/delivery.service.test.ts (task 4.1/10.1) which this replaces.
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../shared/db.js";
import { createLogger } from "../../shared/logger.js";
import { setBusinessEventLoggerForTests } from "../../shared/business-event-logger.js";
import { recurrenceService } from "../recurrence/recurrence.service.js";
import { caseService } from "./case.service.js";

/** Isolate non-apply tests from active templates in the shared DB (omit = full apply). */
const noApply = { templateOperations: [] as const };

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

/** Physical delete of all tasks for a case (active + soft-deleted) so RESTRICT FK allows case cleanup. */
async function hardDeleteTasksForCase(caseId: string): Promise<void> {
  await db.$executeRawUnsafe(`DELETE FROM tasks WHERE case_id = ?`, caseId);
}

/** Drop template-sourced tasks then the template rows (RESTRICT on source_template_id). */
async function hardDeleteTemplates(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(
    `DELETE FROM tasks WHERE source_template_id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  await hardDelete("recurring_task_templates", ids);
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

function findEvent(event: string): Record<string, unknown> | undefined {
  return lines.find((l) => l.event === event);
}

beforeEach(() => {
  const collected = collectingStream();
  lines = collected.lines;
  setBusinessEventLoggerForTests(createLogger("debug", collected.stream));
});

afterAll(async () => {
  await db.$disconnect();
});

describe("caseService.create (task 3.2)", () => {
  it("creates a case holding name/startDate/endDate (Requirement 2.2, 2.3)", async () => {
    const startDate = new Date("2036-09-01");
    const endDate = new Date("2036-09-30");
    const created = await caseService.create({ name: "case A", startDate, endDate, ...noApply });

    expect(created.name).toBe("case A");
    expect(created.startDate?.getTime()).toBe(startDate.getTime());
    expect(created.endDate.getTime()).toBe(endDate.getTime());

    await hardDelete("cases", [created.id]);
  });

  it("rejects an empty name (Requirement 2.3)", async () => {
    await expect(caseService.create({ name: "  ", endDate: new Date("2036-01-01"), ...noApply })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects startDate later than endDate (Requirement 2.4)", async () => {
    await expect(
      caseService.create({
        name: "bad range",
        startDate: new Date("2036-05-10"),
        endDate: new Date("2036-05-01"),
        ...noApply,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("allows creating without a startDate", async () => {
    const created = await caseService.create({ name: "no start", endDate: new Date("2036-11-01"), ...noApply });

    expect(created.startDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  // Task 13.2 (Requirement 2.4, 2.5, 5.3, 5.4): endDate is now optional too,
  // so the startDate > endDate ordering check must be skipped whenever
  // either side is missing, not just when startDate is missing.
  it("succeeds with only endDate provided (no startDate)", async () => {
    const created = await caseService.create({ name: "only end", endDate: new Date("2036-11-02"), ...noApply });

    expect(created.startDate).toBeNull();
    expect(created.endDate?.getTime()).toBe(new Date("2036-11-02").getTime());

    await hardDelete("cases", [created.id]);
  });

  it("succeeds with only startDate provided (no endDate)", async () => {
    const created = await caseService.create({ name: "only start", startDate: new Date("2036-11-03"), ...noApply });

    expect(created.startDate?.getTime()).toBe(new Date("2036-11-03").getTime());
    expect(created.endDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("succeeds with neither startDate nor endDate provided", async () => {
    const created = await caseService.create({ name: "no dates at all", ...noApply });

    expect(created.startDate).toBeNull();
    expect(created.endDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("defaults isCompleted to false and does not accept it as input (Requirement 2.5)", async () => {
    // CreateCaseInput has no isCompleted field at all — verified at the type
    // level by case.types.ts (task 3.1). Here we assert the runtime default.
    const created = await caseService.create({ name: "fresh case", endDate: new Date("2036-12-01"), ...noApply });

    expect(created.isCompleted).toBe(false);

    await hardDelete("cases", [created.id]);
  });

  it("logs case.created with the requestId and the new case's id (Requirement 10.2 pattern)", async () => {
    let caseId: string | undefined;
    try {
      const created = await caseService.create(
        { name: `logged-${randomUUID()}`, endDate: new Date("2037-01-01"), ...noApply },
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

describe("caseService.update (task 3.2)", () => {
  it("updates isCompleted alone without touching dates (Requirement 5.1, 5.4)", async () => {
    const startDate = new Date("2036-01-01");
    const endDate = new Date("2036-01-31");
    const created = await caseService.create({ name: "toggle only", startDate, endDate, ...noApply });

    const updated = await caseService.update(created.id, { isCompleted: true, ...noApply });

    expect(updated.isCompleted).toBe(true);
    expect(updated.startDate?.getTime()).toBe(startDate.getTime());
    expect(updated.endDate.getTime()).toBe(endDate.getTime());

    await hardDelete("cases", [created.id]);
  });

  it("updates name alone", async () => {
    const created = await caseService.create({ name: "old name", endDate: new Date("2036-02-01"), ...noApply });

    const updated = await caseService.update(created.id, { name: "new name", ...noApply });

    expect(updated.name).toBe("new name");

    await hardDelete("cases", [created.id]);
  });

  it("clears startDate independently via null", async () => {
    const created = await caseService.create({
      name: "clearable",
      startDate: new Date("2036-03-01"),
      endDate: new Date("2036-03-31"),
      ...noApply,
    });

    const updated = await caseService.update(created.id, { startDate: null, ...noApply });

    expect(updated.startDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("rejects a resulting startDate later than endDate, merging with the currently-persisted value (Requirement 5.3)", async () => {
    const created = await caseService.create({
      name: "merge check",
      startDate: new Date("2036-04-01"),
      endDate: new Date("2036-04-30"),
      ...noApply,
    });

    // Only endDate is supplied; must merge with the persisted startDate
    // (2036-04-01) to detect the violation.
    await expect(
      caseService.update(created.id, { endDate: new Date("2036-03-01"), ...noApply }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    await hardDelete("cases", [created.id]);
  });

  it("returns not_found (404) when updating a non-existent case", async () => {
    await expect(caseService.update(randomUUID(), { name: "ghost", ...noApply })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // Task 13.2 (Requirement 5.3, 5.4): both startDate and endDate can now be
  // null on the persisted case, so the merge-then-validate check must
  // tolerate null on either side of the comparison, not just skip validation
  // when only startDate was previously unset.
  it("sets only endDate when the case currently has no startDate, without triggering the ordering check", async () => {
    const created = await caseService.create({ name: "no start yet", ...noApply });

    const updated = await caseService.update(created.id, { endDate: new Date("2036-09-05"), ...noApply });

    expect(updated.startDate).toBeNull();
    expect(updated.endDate?.getTime()).toBe(new Date("2036-09-05").getTime());

    await hardDelete("cases", [created.id]);
  });

  it("rejects updating endDate to before the persisted startDate even when the case was created without an endDate (merge-validation)", async () => {
    const created = await caseService.create({
      name: "merge from unset endDate",
      startDate: new Date("2026-01-01"),
      ...noApply,
    });

    // Post-merge: startDate=2026-01-01 (persisted), endDate=2025-12-01 (new)
    // — both non-null and out of order, so this must be rejected.
    await expect(
      caseService.update(created.id, { endDate: new Date("2025-12-01"), ...noApply }),
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
      ...noApply,
    });

    const updated = await caseService.update(created.id, { endDate: null, ...noApply });

    expect(updated.startDate?.getTime()).toBe(new Date("2036-09-10").getTime());
    expect(updated.endDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });
});

describe("caseService.getProgress (task 3.2)", () => {
  it("returns isOverdueWithIncomplete=false when isCompleted=true even though endDate is in the past and required tasks are incomplete (Requirement 6.2)", async () => {
    const created = await caseService.create({ name: "past but done", endDate: new Date("2000-01-01"), ...noApply });
    const openTask = await db.task.create({
      data: { title: "still open", priority: "low", caseId: created.id, isRequiredForCase: true },
    });
    await caseService.update(created.id, { isCompleted: true, ...noApply });

    const progress = await caseService.getProgress(created.id);

    expect(progress.requiredIncomplete).toBe(1);
    expect(progress.isOverdueWithIncomplete).toBe(false);

    await hardDelete("tasks", [openTask.id]);
    await hardDelete("cases", [created.id]);
  });

  it("returns isOverdueWithIncomplete=true when not completed, endDate is past, and required tasks incomplete (Requirement 6.1)", async () => {
    const created = await caseService.create({ name: "overdue", endDate: new Date("2000-01-01"), ...noApply });
    const openTask = await db.task.create({
      data: { title: "still open", priority: "low", caseId: created.id, isRequiredForCase: true },
    });

    const progress = await caseService.getProgress(created.id);

    expect(progress.requiredTotal).toBe(1);
    expect(progress.requiredCompleted).toBe(0);
    expect(progress.requiredIncomplete).toBe(1);
    expect(progress.isOverdueWithIncomplete).toBe(true);

    await hardDelete("tasks", [openTask.id]);
    await hardDelete("cases", [created.id]);
  });

  // Task 13.3 (Requirement 6.3): endDate is now optional (task 13.1), so a
  // case with no endDate at all has no basis for an overdue judgement,
  // regardless of isCompleted/required-task state. This case is otherwise
  // "as overdue as possible" (not completed, has an incomplete required
  // task) except for the missing endDate, to prove that specific guard —
  // not isCompleted or requiredIncomplete — is what suppresses the flag.
  it("returns isOverdueWithIncomplete=false when endDate is unset even though not completed and required tasks are incomplete (Requirement 6.3)", async () => {
    const created = await caseService.create({ name: "no end date", ...noApply });
    const openTask = await db.task.create({
      data: { title: "still open", priority: "low", caseId: created.id, isRequiredForCase: true },
    });

    const progress = await caseService.getProgress(created.id);

    expect(progress.requiredIncomplete).toBe(1);
    expect(progress.isOverdueWithIncomplete).toBe(false);

    await hardDelete("tasks", [openTask.id]);
    await hardDelete("cases", [created.id]);
  });

  it("returns not_found (404) for progress of a non-existent case", async () => {
    await expect(caseService.getProgress(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("caseService.delete (task 3.2)", () => {
  it("detaches linked tasks and removes the case, logging case.deleted (Requirement 8.1, 8.2)", async () => {
    const created = await caseService.create({ name: "to delete", endDate: new Date("2036-06-01"), ...noApply });
    const linkedTask = await db.task.create({ data: { title: "keep me", priority: "low", caseId: created.id } });

    await caseService.delete(created.id, "req-case-delete");

    const list = await caseService.list();
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
    await expect(caseService.delete(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("caseService templateOperations + same-TX apply (task 4, Requirements 3.2–3.4, 3.6, 4.3, 4.13)", () => {
  it("create with both dates (omit templateOperations) attaches tasks from active start/end/month templates (Requirements 3.4, 3.6)", async () => {
    const templateIds: string[] = [];
    let caseId: string | undefined;
    try {
      const startTpl = await recurrenceService.registerTemplate({
        title: `t4-start-${randomUUID()}`,
        priority: "high",
        caseAnchor: "case_start",
        caseOffsetDays: 0,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(startTpl.id);
      const endTpl = await recurrenceService.registerTemplate({
        title: `t4-end-${randomUUID()}`,
        priority: "medium",
        caseAnchor: "case_end",
        caseOffsetDays: 0,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(endTpl.id);
      const monthStartTpl = await recurrenceService.registerTemplate({
        title: `t4-mstart-${randomUUID()}`,
        priority: "low",
        caseAnchor: "period_month_start",
        caseOffsetDays: 0,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(monthStartTpl.id);

      const created = await caseService.create({
        name: `t4-both-${randomUUID()}`,
        startDate: new Date("2036-06-01T00:00:00.000Z"),
        endDate: new Date("2036-06-15T00:00:00.000Z"),
      });
      caseId = created.id;

      const instances = await db.task.findMany({
        where: { caseId: created.id },
        orderBy: { scheduledDate: "asc" },
      });
      const byTemplate = new Set(instances.map((t) => t.sourceTemplateId));
      expect(byTemplate.has(startTpl.id)).toBe(true);
      expect(byTemplate.has(endTpl.id)).toBe(true);
      expect(byTemplate.has(monthStartTpl.id)).toBe(true);
      expect(instances.some((t) => t.sourceAnchor === "case_start")).toBe(true);
      expect(instances.some((t) => t.sourceAnchor === "case_end")).toBe(true);
      expect(instances.some((t) => t.sourceAnchor === "period_month_start")).toBe(true);
    } finally {
      if (caseId) {
        await hardDeleteTasksForCase(caseId);
        await hardDelete("cases", [caseId]);
      }
      await hardDeleteTemplates(templateIds);
    }
  });

  it("create rejects templateOperations that are not a subset of full candidates with 400", async () => {
    await expect(
      caseService.create({
        name: `t4-bad-ops-${randomUUID()}`,
        startDate: new Date("2036-06-01T00:00:00.000Z"),
        endDate: new Date("2036-06-15T00:00:00.000Z"),
        // create candidates are generate-only; delete is not a subset
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

  it("update with templateOperations: [] changes dates only and does not regenerate (Requirement 4.13)", async () => {
    const templateIds: string[] = [];
    let caseId: string | undefined;
    try {
      const template = await recurrenceService.registerTemplate({
        title: `t4-empty-ops-${randomUUID()}`,
        priority: "low",
        caseAnchor: "case_end",
        caseOffsetDays: 2,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      const created = await caseService.create({
        name: `t4-empty-ops-case-${randomUUID()}`,
        startDate: new Date("2036-07-01T00:00:00.000Z"),
        endDate: new Date("2036-07-10T00:00:00.000Z"),
        templateOperations: ["end_generate"],
      });
      caseId = created.id;
      const [instance] = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: created.id } });
      expect(instance).toBeDefined();
      expect(instance.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-07-08");

      const updated = await caseService.update(created.id, {
        endDate: new Date("2036-07-20T00:00:00.000Z"),
        templateOperations: [],
      });
      expect(updated.endDate?.toISOString().slice(0, 10)).toBe("2036-07-20");

      const unchanged = await db.task.findUnique({ where: { id: instance.id } });
      expect(unchanged?.deletedAt).toBeNull();
      expect(unchanged?.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-07-08");
    } finally {
      if (caseId) {
        await hardDeleteTasksForCase(caseId);
        await hardDelete("cases", [caseId]);
      }
      await hardDeleteTemplates(templateIds);
    }
  });

  it("create with startDate only (omit) applies start_generate only (Requirement 3.2)", async () => {
    const templateIds: string[] = [];
    let caseId: string | undefined;
    try {
      const startTpl = await recurrenceService.registerTemplate({
        title: `t4-start-only-${randomUUID()}`,
        priority: "high",
        caseAnchor: "case_start",
        caseOffsetDays: 1,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(startTpl.id);
      const endTpl = await recurrenceService.registerTemplate({
        title: `t4-end-ignored-${randomUUID()}`,
        priority: "low",
        caseAnchor: "case_end",
        caseOffsetDays: 0,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(endTpl.id);

      const created = await caseService.create({
        name: `t4-start-only-case-${randomUUID()}`,
        startDate: new Date("2036-08-10T00:00:00.000Z"),
      });
      caseId = created.id;

      // Shared DB may have other active case_start templates; assert ours and that end is unused.
      const fromStart = await db.task.findMany({ where: { caseId: created.id, sourceTemplateId: startTpl.id } });
      expect(fromStart).toHaveLength(1);
      expect(fromStart[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2036-08-11");
      const fromEnd = await db.task.findMany({ where: { caseId: created.id, sourceTemplateId: endTpl.id } });
      expect(fromEnd).toHaveLength(0);
      expect(await db.task.count({ where: { caseId: created.id, sourceAnchor: "case_end" } })).toBe(0);
    } finally {
      if (caseId) {
        await hardDeleteTasksForCase(caseId);
        await hardDelete("cases", [caseId]);
      }
      await hardDeleteTemplates(templateIds);
    }
  });
});

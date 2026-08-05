// RED: caseService does not exist yet (task 3.2, design.md "Backend/cases"
// CaseService, Requirements 2.3, 2.4, 2.5, 5.3, 5.4, 6.1, 6.2, 8.1, 8.2).
// Integration test against real MySQL via shared/db.ts (this project's
// testing steering: no mocking of the DB layer), mirroring
// deliveries/delivery.service.test.ts (task 4.1/10.1) which this replaces.
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { createLogger } from "../../shared/logger.js";
import { setBusinessEventLoggerForTests } from "../../shared/business-event-logger.js";
import { recurrenceService } from "../recurrence/recurrence.service.js";
import { caseService } from "./case.service.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
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
    const created = await caseService.create({ name: "case A", startDate, endDate });

    expect(created.name).toBe("case A");
    expect(created.startDate?.getTime()).toBe(startDate.getTime());
    expect(created.endDate.getTime()).toBe(endDate.getTime());

    await hardDelete("cases", [created.id]);
  });

  it("rejects an empty name (Requirement 2.3)", async () => {
    await expect(caseService.create({ name: "  ", endDate: new Date("2036-01-01") })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects startDate later than endDate (Requirement 2.4)", async () => {
    await expect(
      caseService.create({ name: "bad range", startDate: new Date("2036-05-10"), endDate: new Date("2036-05-01") }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("allows creating without a startDate", async () => {
    const created = await caseService.create({ name: "no start", endDate: new Date("2036-11-01") });

    expect(created.startDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  // Task 13.2 (Requirement 2.4, 2.5, 5.3, 5.4): endDate is now optional too,
  // so the startDate > endDate ordering check must be skipped whenever
  // either side is missing, not just when startDate is missing.
  it("succeeds with only endDate provided (no startDate)", async () => {
    const created = await caseService.create({ name: "only end", endDate: new Date("2036-11-02") });

    expect(created.startDate).toBeNull();
    expect(created.endDate?.getTime()).toBe(new Date("2036-11-02").getTime());

    await hardDelete("cases", [created.id]);
  });

  it("succeeds with only startDate provided (no endDate)", async () => {
    const created = await caseService.create({ name: "only start", startDate: new Date("2036-11-03") });

    expect(created.startDate?.getTime()).toBe(new Date("2036-11-03").getTime());
    expect(created.endDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("succeeds with neither startDate nor endDate provided", async () => {
    const created = await caseService.create({ name: "no dates at all" });

    expect(created.startDate).toBeNull();
    expect(created.endDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("defaults isCompleted to false and does not accept it as input (Requirement 2.5)", async () => {
    // CreateCaseInput has no isCompleted field at all — verified at the type
    // level by case.types.ts (task 3.1). Here we assert the runtime default.
    const created = await caseService.create({ name: "fresh case", endDate: new Date("2036-12-01") });

    expect(created.isCompleted).toBe(false);

    await hardDelete("cases", [created.id]);
  });

  it("logs case.created with the requestId and the new case's id (Requirement 10.2 pattern)", async () => {
    let caseId: string | undefined;
    try {
      const created = await caseService.create({ name: `logged-${randomUUID()}`, endDate: new Date("2037-01-01") }, "req-case-create");
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
    const created = await caseService.create({ name: "toggle only", startDate, endDate });

    const updated = await caseService.update(created.id, { isCompleted: true });

    expect(updated.isCompleted).toBe(true);
    expect(updated.startDate?.getTime()).toBe(startDate.getTime());
    expect(updated.endDate.getTime()).toBe(endDate.getTime());

    await hardDelete("cases", [created.id]);
  });

  it("updates name alone", async () => {
    const created = await caseService.create({ name: "old name", endDate: new Date("2036-02-01") });

    const updated = await caseService.update(created.id, { name: "new name" });

    expect(updated.name).toBe("new name");

    await hardDelete("cases", [created.id]);
  });

  it("clears startDate independently via null", async () => {
    const created = await caseService.create({
      name: "clearable",
      startDate: new Date("2036-03-01"),
      endDate: new Date("2036-03-31"),
    });

    const updated = await caseService.update(created.id, { startDate: null });

    expect(updated.startDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });

  it("rejects a resulting startDate later than endDate, merging with the currently-persisted value (Requirement 5.3)", async () => {
    const created = await caseService.create({
      name: "merge check",
      startDate: new Date("2036-04-01"),
      endDate: new Date("2036-04-30"),
    });

    // Only endDate is supplied; must merge with the persisted startDate
    // (2036-04-01) to detect the violation.
    await expect(caseService.update(created.id, { endDate: new Date("2036-03-01") })).rejects.toMatchObject({
      statusCode: 400,
    });

    await hardDelete("cases", [created.id]);
  });

  it("returns not_found (404) when updating a non-existent case", async () => {
    await expect(caseService.update(randomUUID(), { name: "ghost" })).rejects.toMatchObject({ statusCode: 404 });
  });

  // Task 13.2 (Requirement 5.3, 5.4): both startDate and endDate can now be
  // null on the persisted case, so the merge-then-validate check must
  // tolerate null on either side of the comparison, not just skip validation
  // when only startDate was previously unset.
  it("sets only endDate when the case currently has no startDate, without triggering the ordering check", async () => {
    const created = await caseService.create({ name: "no start yet" });

    const updated = await caseService.update(created.id, { endDate: new Date("2036-09-05") });

    expect(updated.startDate).toBeNull();
    expect(updated.endDate?.getTime()).toBe(new Date("2036-09-05").getTime());

    await hardDelete("cases", [created.id]);
  });

  it("rejects updating endDate to before the persisted startDate even when the case was created without an endDate (merge-validation)", async () => {
    const created = await caseService.create({ name: "merge from unset endDate", startDate: new Date("2026-01-01") });

    // Post-merge: startDate=2026-01-01 (persisted), endDate=2025-12-01 (new)
    // — both non-null and out of order, so this must be rejected.
    await expect(caseService.update(created.id, { endDate: new Date("2025-12-01") })).rejects.toMatchObject({
      statusCode: 400,
    });

    await hardDelete("cases", [created.id]);
  });

  it("clears endDate to null while startDate remains set, without triggering the ordering check", async () => {
    const created = await caseService.create({
      name: "clear end only",
      startDate: new Date("2036-09-10"),
      endDate: new Date("2036-09-20"),
    });

    const updated = await caseService.update(created.id, { endDate: null });

    expect(updated.startDate?.getTime()).toBe(new Date("2036-09-10").getTime());
    expect(updated.endDate).toBeNull();

    await hardDelete("cases", [created.id]);
  });
});

describe("caseService.getProgress (task 3.2)", () => {
  it("returns isOverdueWithIncomplete=false when isCompleted=true even though endDate is in the past and required tasks are incomplete (Requirement 6.2)", async () => {
    const created = await caseService.create({ name: "past but done", endDate: new Date("2000-01-01") });
    const openTask = await db.task.create({
      data: { title: "still open", priority: "low", caseId: created.id, isRequiredForCase: true },
    });
    await caseService.update(created.id, { isCompleted: true });

    const progress = await caseService.getProgress(created.id);

    expect(progress.requiredIncomplete).toBe(1);
    expect(progress.isOverdueWithIncomplete).toBe(false);

    await hardDelete("tasks", [openTask.id]);
    await hardDelete("cases", [created.id]);
  });

  it("returns isOverdueWithIncomplete=true when not completed, endDate is past, and required tasks incomplete (Requirement 6.1)", async () => {
    const created = await caseService.create({ name: "overdue", endDate: new Date("2000-01-01") });
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
    const created = await caseService.create({ name: "no end date" });
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
    const created = await caseService.create({ name: "to delete", endDate: new Date("2036-06-01") });
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

describe("caseService <-> RecurrenceService wiring (task 3.2)", () => {
  it("create() triggers onCaseCreated: an active case_relative template generates a task instance", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "wired estimate doc",
      priority: "high",
      kind: "case_relative",
      caseOffsetDays: 3,
      nonBusinessDayPolicy: "as_is",
    });

    const created = await caseService.create({ name: "wired case", endDate: new Date("2036-06-15") });

    const instances = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: created.id } });
    expect(instances).toHaveLength(1);
    expect(instances[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2036-06-12");

    await hardDelete("tasks", [instances[0].id]);
    await hardDelete("cases", [created.id]);
    await hardDelete("recurring_task_templates", [template.id]);
  });

  it("update() with a changed endDate triggers onCaseEndDateChanged: recomputes an incomplete instance's scheduledDate", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "wired recalculation doc",
      priority: "low",
      kind: "case_relative",
      caseOffsetDays: 2,
      nonBusinessDayPolicy: "as_is",
    });
    const created = await caseService.create({ name: "wired recalculation", endDate: new Date("2036-07-10") });
    const [instance] = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: created.id } });
    expect(instance.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-07-08");

    await caseService.update(created.id, { endDate: new Date("2036-07-20") });

    const recalculated = await db.task.findUnique({ where: { id: instance.id } });
    expect(recalculated?.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-07-18");

    await hardDelete("tasks", [instance.id]);
    await hardDelete("cases", [created.id]);
    await hardDelete("recurring_task_templates", [template.id]);
  });

  // Task 13.4 (Requirement 2.4, 5.3; design.md CaseService Dependencies):
  // endDate unset at create time means the case_relative template must not
  // generate anything at all yet — no call to onCaseCreated.
  it("create() with no endDate does not trigger onCaseCreated: no task instance is generated", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "wired no-end-date doc",
      priority: "low",
      kind: "case_relative",
      caseOffsetDays: 3,
      nonBusinessDayPolicy: "as_is",
    });

    const created = await caseService.create({ name: "wired case without end date" });

    const instances = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: created.id } });
    expect(instances).toHaveLength(0);

    await hardDelete("cases", [created.id]);
    await hardDelete("recurring_task_templates", [template.id]);
  });

  // Task 13.4: 「未設定→値あり」transition on update() must run first-time
  // generation via the same onCaseCreated function create() uses, even
  // though the case was originally created without an endDate at all.
  it("update() setting endDate for the first time (null->value) triggers first-time generation via onCaseCreated", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "wired first-time-set doc",
      priority: "medium",
      kind: "case_relative",
      caseOffsetDays: 4,
      nonBusinessDayPolicy: "as_is",
    });
    const created = await caseService.create({ name: "wired first-time-set" });
    const beforeUpdate = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: created.id } });
    expect(beforeUpdate).toHaveLength(0);

    await caseService.update(created.id, { endDate: new Date("2036-10-20") });

    const instances = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: created.id } });
    expect(instances).toHaveLength(1);
    expect(instances[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2036-10-16");

    await hardDelete("tasks", [instances[0].id]);
    await hardDelete("cases", [created.id]);
    await hardDelete("recurring_task_templates", [template.id]);
  });

  // Task 13.4: 「値あり→未設定」transition must call neither recurrence
  // function — no crash, and any already-generated instance is left
  // exactly as it was (no recalculation, no deletion).
  it("update() clearing endDate to null calls neither recurrence function: existing instance is left untouched", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "wired clear-to-null doc",
      priority: "low",
      kind: "case_relative",
      caseOffsetDays: 2,
      nonBusinessDayPolicy: "as_is",
    });
    const created = await caseService.create({ name: "wired clear-to-null", endDate: new Date("2036-11-10") });
    const [instance] = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: created.id } });
    expect(instance.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-11-08");

    const updated = await caseService.update(created.id, { endDate: null });
    expect(updated.endDate).toBeNull();

    const unchanged = await db.task.findUnique({ where: { id: instance.id } });
    expect(unchanged?.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-11-08");

    await hardDelete("tasks", [instance.id]);
    await hardDelete("cases", [created.id]);
    await hardDelete("recurring_task_templates", [template.id]);
  });

  it("update() without an endDate change does not call onCaseEndDateChanged (instance untouched)", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "wired untouched doc",
      priority: "low",
      kind: "case_relative",
      caseOffsetDays: 1,
      nonBusinessDayPolicy: "as_is",
    });
    const created = await caseService.create({ name: "wired untouched", endDate: new Date("2036-08-10") });
    const [instance] = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: created.id } });

    await caseService.update(created.id, { name: "renamed only" });

    const unchanged = await db.task.findUnique({ where: { id: instance.id } });
    expect(unchanged?.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-08-09");

    await hardDelete("tasks", [instance.id]);
    await hardDelete("cases", [created.id]);
    await hardDelete("recurring_task_templates", [template.id]);
  });
});

// RED: recurrenceService does not exist yet (task 9.1, Requirements 5.6,
// 5.7, 8.3, 9.1-9.4). Integration test against real MySQL via shared/db.ts.
//
// Cleanup policy: every `it()` below deletes its own rows in a `finally`
// block (not just at the end of the happy path). This test suite shares one
// real MySQL database across runs (no per-test transaction rollback), and a
// `recurring_task_templates` row left behind by a failed assertion stays
// `isActive=true` forever — `generateDueInstances`/`onCaseCreated` treat
// *every* active template as in scope, so a single skipped cleanup
// self-perpetuates into unrelated tests (and later full-suite runs)
// generating unbounded extra instances against that leftover template. See
// kanban-task-detail-crud validate-impl NO-GO report (recurrence root-cause
// investigation) for the incident this fixes.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { recurrenceService } from "./recurrence.service.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

// Deletes in FK-safe order (tasks reference templates/cases, so they
// must go first) regardless of which of these a given test happened to
// create. Safe to call with empty arrays for anything unused.
async function cleanup(ids: { taskIds?: string[]; templateIds?: string[]; caseIds?: string[]; nonBusinessDayIds?: string[] }): Promise<void> {
  await hardDelete("tasks", ids.taskIds ?? []);
  await hardDelete("recurring_task_templates", ids.templateIds ?? []);
  await hardDelete("cases", ids.caseIds ?? []);
  await hardDelete("non_business_days", ids.nonBusinessDayIds ?? []);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("recurrenceService.registerTemplate (task 9.1)", () => {
  it("registers a fixed_interval template with a default memo and non-business-day policy (Requirements 5.6, 5.7, 8.3)", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "weekly report",
        priority: "medium",
        kind: "fixed_interval",
        intervalUnit: "week",
        intervalValue: 1,
        defaultMemo: "Zoom: https://example.com/meeting",
        nonBusinessDayPolicy: "next_business_day",
      });
      templateIds.push(template.id);

      expect(template.kind).toBe("fixed_interval");
      expect(template.defaultMemo).toBe("Zoom: https://example.com/meeting");
      expect(template.nonBusinessDayPolicy).toBe("next_business_day");
      expect(template.isActive).toBe(true);
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("registers a case_relative template with an offset", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "estimate document",
        priority: "high",
        kind: "case_relative",
        caseOffsetDays: 3,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);

      expect(template.kind).toBe("case_relative");
      expect(template.caseOffsetDays).toBe(3);
      expect(template.boundCaseId).toBeNull();
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("rejects a fixed_interval template missing intervalUnit/intervalValue", async () => {
    await expect(
      recurrenceService.registerTemplate({
        title: "bad template",
        priority: "low",
        kind: "fixed_interval",
        nonBusinessDayPolicy: "as_is",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a case_relative template missing caseOffsetDays", async () => {
    await expect(
      recurrenceService.registerTemplate({
        title: "bad template",
        priority: "low",
        kind: "case_relative",
        nonBusinessDayPolicy: "as_is",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a negative caseOffsetDays", async () => {
    await expect(
      recurrenceService.registerTemplate({
        title: "bad template",
        priority: "low",
        kind: "case_relative",
        caseOffsetDays: -1,
        nonBusinessDayPolicy: "as_is",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a case_relative template that also sets boundCaseId (design.md Logical Data Model: boundCaseId is fixed_interval-only)", async () => {
    const caseIds: string[] = [];
    try {
      const caseEntity = await db.case.create({ data: { name: `d-${randomUUID()}`, endDate: new Date() } });
      caseIds.push(caseEntity.id);

      await expect(
        recurrenceService.registerTemplate({
          title: "bad template",
          priority: "low",
          kind: "case_relative",
          caseOffsetDays: 1,
          boundCaseId: caseEntity.id,
          nonBusinessDayPolicy: "as_is",
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    } finally {
      await cleanup({ caseIds });
    }
  });

  it("rejects an empty title", async () => {
    await expect(
      recurrenceService.registerTemplate({
        title: "  ",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("recurrenceService.stopTemplate / deleteTemplate / list (task 9.1)", () => {
  it("stopTemplate sets isActive=false without removing it from list", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "stoppable",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);

      await recurrenceService.stopTemplate(template.id);

      const list = await recurrenceService.list();
      const found = list.find((t) => t.id === template.id);
      expect(found?.isActive).toBe(false);
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("returns not_found (404) when stopping a non-existent template", async () => {
    await expect(recurrenceService.stopTemplate(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deleteTemplate soft-deletes and excludes it from list, distinct from stopTemplate", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "deletable",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);

      await recurrenceService.deleteTemplate(template.id);

      const list = await recurrenceService.list();
      expect(list.some((t) => t.id === template.id)).toBe(false);

      const rawRow = await db.recurringTaskTemplate.findFirst({ where: { id: template.id, deletedAt: { not: null } } });
      expect(rawRow).not.toBeNull();
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("returns not_found (404) when deleting a non-existent template", async () => {
    await expect(recurrenceService.deleteTemplate(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists registered templates", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "listable",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "month",
        intervalValue: 1,
        nonBusinessDayPolicy: "skip",
      });
      templateIds.push(template.id);

      const list = await recurrenceService.list();

      expect(list.some((t) => t.id === template.id)).toBe(true);
    } finally {
      await cleanup({ templateIds });
    }
  });
});

// RED: generateDueInstances/onCaseCreated/onCaseEndDateChanged do
// not exist yet (task 9.2, Requirements 5.1, 5.2, 5.5, 5.8, 5.9, 8.4-8.7).
async function forceCreatedAt(templateId: string, createdAt: Date): Promise<void> {
  await db.$executeRawUnsafe(
    "UPDATE recurring_task_templates SET created_at = ? WHERE id = ?",
    createdAt,
    templateId,
  );
}

describe("recurrenceService.generateDueInstances — fixed_interval (task 9.2)", () => {
  it("generates one instance per rrule occurrence between the template's creation date and asOf, copying defaultMemo (Requirements 5.1, 5.8)", async () => {
    const templateIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "weekly checkin",
        priority: "medium",
        kind: "fixed_interval",
        intervalUnit: "week",
        intervalValue: 1,
        defaultMemo: "sync with client",
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      await forceCreatedAt(template.id, new Date("2034-01-02T00:00:00.000Z")); // a Monday

      const created = await recurrenceService.generateDueInstances(new Date("2034-01-23T00:00:00.000Z"));
      const mine = created.filter((t) => t.sourceTemplateId === template.id);
      taskIds = mine.map((t) => t.id);

      const dates = mine.map((t) => t.scheduledDate?.toISOString().slice(0, 10)).sort();
      expect(dates).toEqual(["2034-01-02", "2034-01-09", "2034-01-16", "2034-01-23"]);
      expect(mine.every((t) => t.memo === "sync with client")).toBe(true);
    } finally {
      await cleanup({ taskIds, templateIds });
    }
  });

  it("is idempotent: calling generateDueInstances again with the same asOf does not duplicate instances (Requirement: 冪等性)", async () => {
    const templateIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "daily standup",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      await forceCreatedAt(template.id, new Date("2034-02-01T00:00:00.000Z"));
      const asOf = new Date("2034-02-03T00:00:00.000Z");

      const firstRun = await recurrenceService.generateDueInstances(asOf);
      const secondRun = await recurrenceService.generateDueInstances(asOf);

      expect(firstRun.filter((t) => t.sourceTemplateId === template.id)).toHaveLength(3);
      expect(secondRun.filter((t) => t.sourceTemplateId === template.id)).toHaveLength(0);

      const allInstances = await db.task.findMany({ where: { sourceTemplateId: template.id } });
      taskIds = allInstances.map((t) => t.id);
      expect(allInstances).toHaveLength(3);
    } finally {
      await cleanup({ taskIds, templateIds });
    }
  });

  it("does not generate instances for a stopped (isActive=false) template", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "stopped daily",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      await forceCreatedAt(template.id, new Date("2034-03-01T00:00:00.000Z"));
      await recurrenceService.stopTemplate(template.id);

      const created = await recurrenceService.generateDueInstances(new Date("2034-03-05T00:00:00.000Z"));

      expect(created.filter((t) => t.sourceTemplateId === template.id)).toHaveLength(0);
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("policy=skip: does not generate an instance for an occurrence that falls on a non-business day (Requirement 8.6)", async () => {
    const templateIds: string[] = [];
    const nonBusinessDayIds: string[] = [];
    try {
      const holiday = await db.nonBusinessDay.create({ data: { date: new Date("2034-04-10"), source: "manual" } });
      nonBusinessDayIds.push(holiday.id);
      const template = await recurrenceService.registerTemplate({
        title: "skip policy",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "skip",
      });
      templateIds.push(template.id);
      await forceCreatedAt(template.id, new Date("2034-04-10T00:00:00.000Z"));

      const created = await recurrenceService.generateDueInstances(new Date("2034-04-10T00:00:00.000Z"));

      expect(created.filter((t) => t.sourceTemplateId === template.id)).toHaveLength(0);
    } finally {
      await cleanup({ templateIds, nonBusinessDayIds });
    }
  });

  it("policy=as_is: registers the occurrence unchanged even when it falls on a non-business day (Requirement 8.7)", async () => {
    const templateIds: string[] = [];
    const nonBusinessDayIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const holiday = await db.nonBusinessDay.create({ data: { date: new Date("2034-04-11"), source: "manual" } });
      nonBusinessDayIds.push(holiday.id);
      const template = await recurrenceService.registerTemplate({
        title: "as_is policy",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      await forceCreatedAt(template.id, new Date("2034-04-11T00:00:00.000Z"));

      const created = await recurrenceService.generateDueInstances(new Date("2034-04-11T00:00:00.000Z"));
      taskIds = created.map((t) => t.id);

      expect(created).toHaveLength(1);
      expect(created[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2034-04-11");
    } finally {
      await cleanup({ taskIds, templateIds, nonBusinessDayIds });
    }
  });

  it("policy=next_business_day: shifts the occurrence forward to the nearest following business day (Requirement 8.4)", async () => {
    const templateIds: string[] = [];
    const nonBusinessDayIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const holiday = await db.nonBusinessDay.create({ data: { date: new Date("2034-04-12"), source: "manual" } });
      nonBusinessDayIds.push(holiday.id);
      const template = await recurrenceService.registerTemplate({
        title: "next_business_day policy",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "next_business_day",
      });
      templateIds.push(template.id);
      await forceCreatedAt(template.id, new Date("2034-04-12T00:00:00.000Z"));

      const created = await recurrenceService.generateDueInstances(new Date("2034-04-12T00:00:00.000Z"));
      taskIds = created.map((t) => t.id);

      expect(created).toHaveLength(1);
      expect(created[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2034-04-13");
    } finally {
      await cleanup({ taskIds, templateIds, nonBusinessDayIds });
    }
  });

  it("policy=previous_business_day: shifts the occurrence backward to the nearest preceding business day (Requirement 8.5)", async () => {
    const templateIds: string[] = [];
    const nonBusinessDayIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const holiday = await db.nonBusinessDay.create({ data: { date: new Date("2034-04-13"), source: "manual" } });
      nonBusinessDayIds.push(holiday.id);
      const template = await recurrenceService.registerTemplate({
        title: "previous_business_day policy",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "previous_business_day",
      });
      templateIds.push(template.id);
      await forceCreatedAt(template.id, new Date("2034-04-13T00:00:00.000Z"));

      const created = await recurrenceService.generateDueInstances(new Date("2034-04-13T00:00:00.000Z"));
      taskIds = created.map((t) => t.id);

      expect(created).toHaveLength(1);
      expect(created[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2034-04-12");
    } finally {
      await cleanup({ taskIds, templateIds, nonBusinessDayIds });
    }
  });
});

describe("recurrenceService.onCaseCreated (task 9.2, Requirement 5.2)", () => {
  it("creates one instance offset from the case's endDate, copying defaultMemo", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "estimate doc",
        priority: "high",
        kind: "case_relative",
        caseOffsetDays: 3,
        defaultMemo: "use the standard template",
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      const caseEntity = await db.case.create({ data: { name: "release", endDate: new Date("2034-06-15") } });
      caseIds.push(caseEntity.id);

      const created = await recurrenceService.onCaseCreated(caseEntity);
      taskIds = created.map((t) => t.id);

      expect(created).toHaveLength(1);
      expect(created[0].caseId).toBe(caseEntity.id);
      expect(created[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2034-06-12");
      expect(created[0].memo).toBe("use the standard template");
    } finally {
      await cleanup({ taskIds, caseIds, templateIds });
    }
  });

  it("is idempotent for the same case", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "idempotent doc",
        priority: "low",
        kind: "case_relative",
        caseOffsetDays: 1,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      const caseEntity = await db.case.create({ data: { name: "release", endDate: new Date("2034-06-20") } });
      caseIds.push(caseEntity.id);

      await recurrenceService.onCaseCreated(caseEntity);
      const second = await recurrenceService.onCaseCreated(caseEntity);

      expect(second).toHaveLength(0);
      const all = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: caseEntity.id } });
      taskIds = all.map((t) => t.id);
      expect(all).toHaveLength(1);
    } finally {
      await cleanup({ taskIds, caseIds, templateIds });
    }
  });

  it("ignores stopped (isActive=false) case_relative templates", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "stopped case template",
        priority: "low",
        kind: "case_relative",
        caseOffsetDays: 1,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      await recurrenceService.stopTemplate(template.id);
      const caseEntity = await db.case.create({ data: { name: "release", endDate: new Date("2034-06-25") } });
      caseIds.push(caseEntity.id);

      const created = await recurrenceService.onCaseCreated(caseEntity);

      expect(created.filter((t) => t.sourceTemplateId === template.id)).toHaveLength(0);
    } finally {
      await cleanup({ caseIds, templateIds });
    }
  });
});

describe("recurrenceService.onCaseEndDateChanged (task 9.2, Requirement 5.4 core logic)", () => {
  it("recomputes the scheduledDate of an existing incomplete instance in place (no duplicate row)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "recalculable doc",
        priority: "low",
        kind: "case_relative",
        caseOffsetDays: 3,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      const caseEntity = await db.case.create({ data: { name: "release", endDate: new Date("2034-07-15") } });
      caseIds.push(caseEntity.id);
      const [original] = await recurrenceService.onCaseCreated(caseEntity);
      const updatedCase = await db.case.update({ where: { id: caseEntity.id }, data: { endDate: new Date("2034-07-20") } });

      const updated = await recurrenceService.onCaseEndDateChanged(updatedCase);

      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe(original.id);
      expect(updated[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2034-07-17");

      const all = await db.task.findMany({ where: { sourceTemplateId: template.id, caseId: caseEntity.id } });
      taskIds = all.map((t) => t.id);
      expect(all).toHaveLength(1);
    } finally {
      await cleanup({ taskIds, caseIds, templateIds });
    }
  });

  it("does not change a completed instance's scheduledDate (Requirement 5.4)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "completed doc",
        priority: "low",
        kind: "case_relative",
        caseOffsetDays: 2,
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      const caseEntity = await db.case.create({ data: { name: "release", endDate: new Date("2034-08-10") } });
      caseIds.push(caseEntity.id);
      const [instance] = await recurrenceService.onCaseCreated(caseEntity);
      taskIds = [instance.id];
      await db.task.update({ where: { id: instance.id }, data: { status: "done" } });
      const updatedCase = await db.case.update({ where: { id: caseEntity.id }, data: { endDate: new Date("2034-08-20") } });

      const updated = await recurrenceService.onCaseEndDateChanged(updatedCase);

      expect(updated).toHaveLength(0);
      const unchanged = await db.task.findUnique({ where: { id: instance.id } });
      expect(unchanged?.scheduledDate?.toISOString().slice(0, 10)).toBe("2034-08-08");
    } finally {
      await cleanup({ taskIds, caseIds, templateIds });
    }
  });
});

describe("generated instance memo independence (task 9.2, Requirement 5.9)", () => {
  it("editing one instance's memo does not affect the template's defaultMemo or a sibling instance", async () => {
    const templateIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate({
        title: "independence check",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        defaultMemo: "shared default",
        nonBusinessDayPolicy: "as_is",
      });
      templateIds.push(template.id);
      await forceCreatedAt(template.id, new Date("2034-09-01T00:00:00.000Z"));
      const allCreated = await recurrenceService.generateDueInstances(new Date("2034-09-02T00:00:00.000Z"));
      const created = allCreated.filter((t) => t.sourceTemplateId === template.id);
      taskIds = created.map((t) => t.id);
      expect(created).toHaveLength(2);

      await db.task.update({ where: { id: created[0].id }, data: { memo: "edited just for this instance" } });

      const sibling = await db.task.findUnique({ where: { id: created[1].id } });
      const templateAfter = await db.recurringTaskTemplate.findUnique({ where: { id: template.id } });
      expect(sibling?.memo).toBe("shared default");
      expect(templateAfter?.defaultMemo).toBe("shared default");
    } finally {
      await cleanup({ taskIds, templateIds });
    }
  });
});

// RecurrenceService template management (task 2.1, Requirements 1.1, 1.2,
// 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8). Case-relative only — no fixed_interval,
// generateDueInstances, or unconfirmed auto-apply entrypoints.
//
// Cleanup policy: every `it()` deletes its own rows in a `finally` block
// (not just at the end of the happy path). This suite shares one real MySQL
// database across runs.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { recurrenceRepository } from "./recurrence.repository.js";
import { computeRawScheduledDates, recurrenceService } from "./recurrence.service.js";
import type { CaseRelativeAnchor, RegisterTemplateInput } from "./recurrence.types.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function cleanup(ids: {
  taskIds?: string[];
  templateIds?: string[];
  caseIds?: string[];
  nonBusinessDayIds?: string[];
}): Promise<void> {
  await hardDelete("tasks", ids.taskIds ?? []);
  await hardDelete("recurring_task_templates", ids.templateIds ?? []);
  await hardDelete("cases", ids.caseIds ?? []);
  await hardDelete("non_business_days", ids.nonBusinessDayIds ?? []);
}

function baseInput(overrides: Partial<RegisterTemplateInput> = {}): RegisterTemplateInput {
  return {
    title: "case-relative template",
    priority: "medium",
    caseAnchor: "case_end",
    caseOffsetDays: 3,
    nonBusinessDayPolicy: "as_is",
    ...overrides,
  };
}

afterAll(async () => {
  await db.$disconnect();
});

describe("recurrenceService.registerTemplate (task 2.1)", () => {
  it("registers a case-relative template with anchor, non-negative offset, NBD policy, and default memo (Requirements 2.1, 2.2, 2.4, 2.5)", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({
          title: "estimate document",
          priority: "high",
          caseAnchor: "case_start",
          caseOffsetDays: 0,
          defaultMemo: "Zoom: https://example.com/meeting",
          nonBusinessDayPolicy: "next_business_day",
        }),
      );
      templateIds.push(template.id);

      expect(template.caseAnchor).toBe("case_start");
      expect(template.caseOffsetDays).toBe(0);
      expect(template.defaultMemo).toBe("Zoom: https://example.com/meeting");
      expect(template.nonBusinessDayPolicy).toBe("next_business_day");
      expect(template.isActive).toBe(true);
      expect(template).not.toHaveProperty("kind");
      expect(template).not.toHaveProperty("intervalUnit");
      expect(template).not.toHaveProperty("intervalValue");
      expect(template).not.toHaveProperty("boundCaseId");
    } finally {
      await cleanup({ templateIds });
    }
  });

  it.each([
    "case_start",
    "case_end",
    "period_month_start",
    "period_month_end",
  ] as CaseRelativeAnchor[])("accepts caseAnchor=%s (Requirement 2.1)", async (caseAnchor) => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(baseInput({ caseAnchor }));
      templateIds.push(template.id);
      expect(template.caseAnchor).toBe(caseAnchor);
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("rejects a negative caseOffsetDays (Requirement 2.2)", async () => {
    await expect(recurrenceService.registerTemplate(baseInput({ caseOffsetDays: -1 }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects a non-integer caseOffsetDays", async () => {
    await expect(recurrenceService.registerTemplate(baseInput({ caseOffsetDays: 1.5 }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects an empty title", async () => {
    await expect(recurrenceService.registerTemplate(baseInput({ title: "  " }))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("recurrenceService.stopTemplate / resumeTemplate / deleteTemplate / list (task 2.1)", () => {
  it("stopTemplate sets isActive=false without removing it from list (Requirement 2.6)", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(baseInput({ title: "stoppable" }));
      templateIds.push(template.id);

      await recurrenceService.stopTemplate(template.id);

      const list = await recurrenceService.list();
      const found = list.find((t) => t.id === template.id);
      expect(found?.isActive).toBe(false);
      const active = await recurrenceRepository.listActive();
      expect(active.some((t) => t.id === template.id)).toBe(false);
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("resumeTemplate sets isActive=true only and does not backfill tasks for existing cases (Requirement 2.7)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    try {
      const caseEntity = await db.case.create({
        data: { name: `resume-${randomUUID()}`, endDate: new Date("2036-06-15") },
      });
      caseIds.push(caseEntity.id);

      const template = await recurrenceService.registerTemplate(baseInput({ title: "resumable" }));
      templateIds.push(template.id);
      await recurrenceService.stopTemplate(template.id);

      await recurrenceService.resumeTemplate(template.id);

      const list = await recurrenceService.list();
      expect(list.find((t) => t.id === template.id)?.isActive).toBe(true);
      const active = await recurrenceRepository.listActive();
      expect(active.some((t) => t.id === template.id)).toBe(true);

      const tasksForCase = await db.task.findMany({
        where: { caseId: caseEntity.id, sourceTemplateId: template.id },
      });
      expect(tasksForCase).toHaveLength(0);
    } finally {
      await cleanup({ templateIds, caseIds });
    }
  });

  it("returns not_found (404) when stopping or resuming a non-existent template", async () => {
    const missing = randomUUID();
    await expect(recurrenceService.stopTemplate(missing)).rejects.toMatchObject({ statusCode: 404 });
    await expect(recurrenceService.resumeTemplate(missing)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deleteTemplate soft-deletes and excludes it from list, distinct from stopTemplate (Requirement 2.8)", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(baseInput({ title: "deletable" }));
      templateIds.push(template.id);

      await recurrenceService.deleteTemplate(template.id);

      const list = await recurrenceService.list();
      expect(list.some((t) => t.id === template.id)).toBe(false);

      const rawRow = await db.recurringTaskTemplate.findFirst({
        where: { id: template.id, deletedAt: { not: null } },
      });
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
      const template = await recurrenceService.registerTemplate(baseInput({ title: "listable" }));
      templateIds.push(template.id);

      const list = await recurrenceService.list();
      expect(list.some((t) => t.id === template.id)).toBe(true);
    } finally {
      await cleanup({ templateIds });
    }
  });
});

describe("recurrenceService public surface (task 2.1)", () => {
  it("does not expose fixed_interval / generate-due / unconfirmed auto-apply entrypoints (Requirements 1.1, 1.2)", () => {
    expect(recurrenceService).not.toHaveProperty("generateDueInstances");
    expect(recurrenceService).not.toHaveProperty("onCaseCreated");
    expect(recurrenceService).not.toHaveProperty("onCaseEndDateChanged");
    expect(typeof recurrenceService.registerTemplate).toBe("function");
    expect(typeof recurrenceService.stopTemplate).toBe("function");
    expect(typeof recurrenceService.resumeTemplate).toBe("function");
    expect(typeof recurrenceService.deleteTemplate).toBe("function");
    expect(typeof recurrenceService.list).toBe("function");
  });
});

// --- task 2.2: schedule calculation + generation helpers ---

describe("computeRawScheduledDates (task 2.2, Requirements 2.3, 6.1–6.3)", () => {
  it("case_start: startDate + offset (Requirement 2.3)", () => {
    expect(
      computeRawScheduledDates("case_start", 3, new Date("2036-01-10T00:00:00.000Z"), new Date("2036-03-01T00:00:00.000Z")),
    ).toEqual(["2036-01-13"]);
  });

  it("case_end: endDate − offset (Requirement 2.3)", () => {
    expect(
      computeRawScheduledDates("case_end", 3, new Date("2036-01-10T00:00:00.000Z"), new Date("2036-06-15T00:00:00.000Z")),
    ).toEqual(["2036-06-12"]);
  });

  it("case_start / case_end return [] when the required case date is missing", () => {
    expect(computeRawScheduledDates("case_start", 0, null, new Date("2036-06-15T00:00:00.000Z"))).toEqual([]);
    expect(computeRawScheduledDates("case_end", 0, new Date("2036-01-10T00:00:00.000Z"), null)).toEqual([]);
  });

  it("period_month_start: 1st + offset per in-range month; skips out-of-period raw dates (Requirements 6.1, 6.3)", () => {
    // Jan 1 out (< start 01-15); Feb 1 and Mar 1 in; offset 0
    expect(
      computeRawScheduledDates(
        "period_month_start",
        0,
        new Date("2036-01-15T00:00:00.000Z"),
        new Date("2036-03-10T00:00:00.000Z"),
      ),
    ).toEqual(["2036-02-01", "2036-03-01"]);
  });

  it("period_month_end: month-end − offset; skips out-of-period raw dates (Requirements 6.1, 6.3)", () => {
    // Jan 31 / Feb 29 in; Mar 31 out (> end 03-10); offset 0
    expect(
      computeRawScheduledDates(
        "period_month_end",
        0,
        new Date("2036-01-15T00:00:00.000Z"),
        new Date("2036-03-10T00:00:00.000Z"),
      ),
    ).toEqual(["2036-01-31", "2036-02-29"]);
  });

  it("period_month_* return [] when start or end is missing (Requirement 6.2)", () => {
    expect(
      computeRawScheduledDates("period_month_start", 0, new Date("2036-01-15T00:00:00.000Z"), null),
    ).toEqual([]);
    expect(
      computeRawScheduledDates("period_month_end", 0, null, new Date("2036-03-10T00:00:00.000Z")),
    ).toEqual([]);
  });

  it("period_month_start with offset skips months whose raw date falls outside the period", () => {
    // Jan 1+20=Jan 21 in; Feb 1+20=Feb 21 in; Mar 1+20=Mar 21 out
    expect(
      computeRawScheduledDates(
        "period_month_start",
        20,
        new Date("2036-01-15T00:00:00.000Z"),
        new Date("2036-03-10T00:00:00.000Z"),
      ),
    ).toEqual(["2036-01-21", "2036-02-21"]);
  });
});

describe("recurrenceService.generateForAnchor (task 2.2, Requirements 5.1, 5.6, 5.7, 6.1)", () => {
  it.each([
    {
      anchor: "case_start" as const,
      offset: 2,
      startDate: new Date("2036-04-10T00:00:00.000Z"),
      endDate: new Date("2036-05-20T00:00:00.000Z"),
      expectedDates: ["2036-04-12"],
    },
    {
      anchor: "case_end" as const,
      offset: 2,
      startDate: new Date("2036-04-10T00:00:00.000Z"),
      endDate: new Date("2036-05-20T00:00:00.000Z"),
      expectedDates: ["2036-05-18"],
    },
    {
      anchor: "period_month_start" as const,
      offset: 0,
      startDate: new Date("2036-04-15T00:00:00.000Z"),
      endDate: new Date("2036-06-10T00:00:00.000Z"),
      expectedDates: ["2036-05-01", "2036-06-01"],
    },
    {
      anchor: "period_month_end" as const,
      offset: 0,
      startDate: new Date("2036-04-15T00:00:00.000Z"),
      endDate: new Date("2036-06-10T00:00:00.000Z"),
      expectedDates: ["2036-04-30", "2036-05-31"],
    },
  ])(
    "generates from active $anchor templates with caseId, defaultMemo, sourceAnchor (Requirements 5.1, 5.6, 5.7)",
    async ({ anchor, offset, startDate, endDate, expectedDates }) => {
      const templateIds: string[] = [];
      const caseIds: string[] = [];
      let taskIds: string[] = [];
      try {
        const template = await recurrenceService.registerTemplate(
          baseInput({
            title: `gen-${anchor}`,
            caseAnchor: anchor,
            caseOffsetDays: offset,
            defaultMemo: "template default memo",
            nonBusinessDayPolicy: "as_is",
          }),
        );
        templateIds.push(template.id);

        const caseEntity = await db.case.create({
          data: { name: `gen-case-${randomUUID()}`, startDate, endDate },
        });
        caseIds.push(caseEntity.id);

        const created = await recurrenceService.generateForAnchor(caseEntity, anchor);
        taskIds = created.map((t) => t.id);

        expect(created).toHaveLength(expectedDates.length);
        expect(created.map((t) => t.scheduledDate?.toISOString().slice(0, 10)).sort()).toEqual(
          [...expectedDates].sort(),
        );
        for (const task of created) {
          expect(task.caseId).toBe(caseEntity.id);
          expect(task.memo).toBe("template default memo");
          expect(task.sourceTemplateId).toBe(template.id);
          expect(task.sourceAnchor).toBe(anchor);
        }
      } finally {
        await cleanup({ taskIds, templateIds, caseIds });
      }
    },
  );

  it("does not use stopped (isActive=false) templates (Requirement 5.1)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "stopped-gen", caseAnchor: "case_end", caseOffsetDays: 1 }),
      );
      templateIds.push(template.id);
      await recurrenceService.stopTemplate(template.id);

      const caseEntity = await db.case.create({
        data: {
          name: `stopped-${randomUUID()}`,
          startDate: new Date("2036-07-01T00:00:00.000Z"),
          endDate: new Date("2036-07-20T00:00:00.000Z"),
        },
      });
      caseIds.push(caseEntity.id);

      const created = await recurrenceService.generateForAnchor(caseEntity, "case_end");
      expect(created).toHaveLength(0);
    } finally {
      await cleanup({ templateIds, caseIds });
    }
  });

  it("applies NBD policy after period check; skip yields no instance (Requirement 5.7)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    const nonBusinessDayIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const holiday = await db.nonBusinessDay.create({
        data: { date: new Date("2036-08-15T00:00:00.000Z"), source: "manual", label: "skip-day" },
      });
      nonBusinessDayIds.push(holiday.id);

      const skipTemplate = await recurrenceService.registerTemplate(
        baseInput({
          title: "nbd-skip",
          caseAnchor: "case_start",
          caseOffsetDays: 0,
          nonBusinessDayPolicy: "skip",
        }),
      );
      templateIds.push(skipTemplate.id);

      const nextTemplate = await recurrenceService.registerTemplate(
        baseInput({
          title: "nbd-next",
          caseAnchor: "case_end",
          caseOffsetDays: 0,
          nonBusinessDayPolicy: "next_business_day",
        }),
      );
      templateIds.push(nextTemplate.id);

      const caseEntity = await db.case.create({
        data: {
          name: `nbd-${randomUUID()}`,
          startDate: new Date("2036-08-15T00:00:00.000Z"),
          endDate: new Date("2036-08-15T00:00:00.000Z"),
        },
      });
      caseIds.push(caseEntity.id);

      const skipped = await recurrenceService.generateForAnchor(caseEntity, "case_start");
      expect(skipped).toHaveLength(0);

      const nexted = await recurrenceService.generateForAnchor(caseEntity, "case_end");
      taskIds = nexted.map((t) => t.id);
      expect(nexted).toHaveLength(1);
      expect(nexted[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2036-08-16");
    } finally {
      await cleanup({ taskIds, templateIds, caseIds, nonBusinessDayIds });
    }
  });

  it("policy=previous_business_day moves scheduledDate to the prior business day (Requirement 5.7)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    const nonBusinessDayIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const holiday = await db.nonBusinessDay.create({
        data: { date: new Date("2036-08-20T00:00:00.000Z"), source: "manual", label: "prev-day" },
      });
      nonBusinessDayIds.push(holiday.id);

      const template = await recurrenceService.registerTemplate(
        baseInput({
          title: "nbd-prev",
          caseAnchor: "case_end",
          caseOffsetDays: 0,
          nonBusinessDayPolicy: "previous_business_day",
        }),
      );
      templateIds.push(template.id);

      const caseEntity = await db.case.create({
        data: {
          name: `nbd-prev-${randomUUID()}`,
          startDate: new Date("2036-08-01T00:00:00.000Z"),
          endDate: new Date("2036-08-20T00:00:00.000Z"),
        },
      });
      caseIds.push(caseEntity.id);

      const created = await recurrenceService.generateForAnchor(caseEntity, "case_end");
      taskIds = created.map((t) => t.id);
      expect(created).toHaveLength(1);
      expect(created[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2036-08-19");
    } finally {
      await cleanup({ taskIds, templateIds, caseIds, nonBusinessDayIds });
    }
  });

  it("editing one instance memo does not change template defaultMemo or sibling memos (Requirement 5.8)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({
          title: "memo-independence",
          caseAnchor: "period_month_start",
          caseOffsetDays: 0,
          defaultMemo: "shared default",
          nonBusinessDayPolicy: "as_is",
        }),
      );
      templateIds.push(template.id);

      const caseEntity = await db.case.create({
        data: {
          name: `memo-${randomUUID()}`,
          startDate: new Date("2036-09-01T00:00:00.000Z"),
          endDate: new Date("2036-10-31T00:00:00.000Z"),
        },
      });
      caseIds.push(caseEntity.id);

      const created = await recurrenceService.generateForAnchor(caseEntity, "period_month_start");
      taskIds = created.map((t) => t.id);
      expect(created).toHaveLength(2);

      await db.task.update({
        where: { id: created[0].id },
        data: { memo: "edited just for this instance" },
      });

      const sibling = await db.task.findUnique({ where: { id: created[1].id } });
      const templateAfter = await db.recurringTaskTemplate.findUnique({ where: { id: template.id } });
      expect(sibling?.memo).toBe("shared default");
      expect(templateAfter?.defaultMemo).toBe("shared default");
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });
});

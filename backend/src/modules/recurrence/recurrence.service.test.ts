// RecurrenceService template management (task 2.1, Requirements 1.1, 1.2,
// 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8). Case-relative only — no fixed_interval,
// generateDueInstances, or unconfirmed auto-apply entrypoints.
//
// Cleanup policy: every `it()` deletes its own rows in a `finally` block
// (not just at the end of the happy path). This suite shares one real MySQL
// database across runs.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import { recurrenceRepository } from "./recurrence.repository.js";
import { computeRawScheduledDates, recurrenceService } from "./recurrence.service.js";
import type { CaseRelativeAnchor, RegisterTemplateInput } from "./recurrence.types.js";

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

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
  if ((ids.taskIds ?? []).length > 0) {
    const taskIds = ids.taskIds ?? [];
    await db.$executeRawUnsafe(
      `DELETE FROM activity_logs WHERE task_id IN (${taskIds.map(() => "?").join(",")})`,
      ...taskIds,
    );
  }
  await hardDelete("tasks", ids.taskIds ?? []);
  await hardDelete("recurring_task_templates", ids.templateIds ?? []);
  await hardDelete("cases", ids.caseIds ?? []);
  await hardDelete("non_business_days", ids.nonBusinessDayIds ?? []);
}

let workspaceA: VerifiedWorkspaceId;
let workspaceB: VerifiedWorkspaceId;
let userId: string;

function baseInput(overrides: Partial<RegisterTemplateInput> = {}): RegisterTemplateInput {
  return {
    title: "case-relative template",
    priority: "medium",
    caseAnchor: "case_end",
    caseOffsetDays: 3,
    nonBusinessDayPolicy: "as_is",
    workspaceId: workspaceA,
    ...overrides,
  };
}

async function createCase(data: {
  name: string;
  startDate?: Date | null;
  endDate?: Date | null;
  workspaceId?: VerifiedWorkspaceId;
}) {
  return db.case.create({
    data: {
      name: data.name,
      startDate: data.startDate === undefined ? undefined : data.startDate,
      endDate: data.endDate === undefined ? new Date("2036-06-15") : data.endDate,
      workspaceId: data.workspaceId ?? workspaceA,
    },
  });
}

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("recurrence-svc-ws") });
  userId = user.id;
  const [a, b] = await Promise.all([
    db.workspace.create({ data: { name: `recurrence-svc-a-${randomUUID()}`, createdByUserId: userId } }),
    db.workspace.create({ data: { name: `recurrence-svc-b-${randomUUID()}`, createdByUserId: userId } }),
  ]);
  workspaceA = asVerified(a.id);
  workspaceB = asVerified(b.id);
});

afterAll(async () => {
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDelete("users", [userId]);
  await db.$disconnect();
});

describe("recurrenceService.registerTemplate (task 2.1)", () => {
  it("registers a case-relative template with anchor, non-negative offset, NBD policy, and default detail (Requirements 2.1, 2.2, 2.4, 2.5)", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({
          title: "estimate document",
          priority: "high",
          caseAnchor: "case_start",
          caseOffsetDays: 0,
          defaultDetail: "Zoom: https://example.com/meeting",
          nonBusinessDayPolicy: "next_business_day",
        }),
      );
      templateIds.push(template.id);

      expect(template.caseAnchor).toBe("case_start");
      expect(template.caseOffsetDays).toBe(0);
      expect(template.defaultDetail).toBe("Zoom: https://example.com/meeting");
      expect(template).not.toHaveProperty("defaultMemo");
      expect(template.nonBusinessDayPolicy).toBe("next_business_day");
      expect(template.isActive).toBe(true);
      expect(template.workspaceId).toBe(workspaceA);
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

      await recurrenceService.stopTemplate(template.id, workspaceA);

      const list = await recurrenceService.list(workspaceA);
      const found = list.find((t) => t.id === template.id);
      expect(found?.isActive).toBe(false);
      const active = await recurrenceRepository.listActive(workspaceA);
      expect(active.some((t) => t.id === template.id)).toBe(false);
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("resumeTemplate sets isActive=true only and does not backfill tasks for existing cases (Requirement 2.7)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    try {
      const caseEntity = await createCase({ name: `resume-${randomUUID()}`, endDate: new Date("2036-06-15") });
      caseIds.push(caseEntity.id);

      const template = await recurrenceService.registerTemplate(baseInput({ title: "resumable" }));
      templateIds.push(template.id);
      await recurrenceService.stopTemplate(template.id, workspaceA);

      await recurrenceService.resumeTemplate(template.id, workspaceA);

      const list = await recurrenceService.list(workspaceA);
      expect(list.find((t) => t.id === template.id)?.isActive).toBe(true);
      const active = await recurrenceRepository.listActive(workspaceA);
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
    await expect(recurrenceService.stopTemplate(missing, workspaceA)).rejects.toMatchObject({ statusCode: 404 });
    await expect(recurrenceService.resumeTemplate(missing, workspaceA)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deleteTemplate soft-deletes and excludes it from list, distinct from stopTemplate (Requirement 2.8)", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(baseInput({ title: "deletable" }));
      templateIds.push(template.id);

      await recurrenceService.deleteTemplate(template.id, workspaceA);

      const list = await recurrenceService.list(workspaceA);
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
    await expect(recurrenceService.deleteTemplate(randomUUID(), workspaceA)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists registered templates", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(baseInput({ title: "listable" }));
      templateIds.push(template.id);

      const list = await recurrenceService.list(workspaceA);
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
  it("records generated tasks with the recurring-template system actor", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({
          title: "system-actor-generation",
          caseAnchor: "case_start",
          caseOffsetDays: 0,
        }),
      );
      templateIds.push(template.id);
      const caseEntity = await createCase({
        name: `system-actor-${randomUUID()}`,
        startDate: new Date("2041-01-10T00:00:00.000Z"),
      });
      caseIds.push(caseEntity.id);

      const created = await recurrenceService.generateForAnchor(caseEntity, "case_start");
      taskIds = created.map((task) => task.id);
      expect(created).toHaveLength(1);

      const log = await db.activityLog.findFirstOrThrow({
        where: {
          taskId: created[0].id,
          operationType: "task_created",
        },
      });
      expect(log).toMatchObject({
        actorUserId: null,
        actorSourceLabel: "recurring_template",
      });
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

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
    "generates from active $anchor templates with caseId, defaultDetail, sourceAnchor (Requirements 5.1, 5.6, 5.7)",
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
            defaultDetail: "template default detail",
            nonBusinessDayPolicy: "as_is",
          }),
        );
        templateIds.push(template.id);

        const caseEntity = await db.case.create({
          data: { name: `gen-case-${randomUUID()}`, startDate, endDate, workspaceId: workspaceA },
        });
        caseIds.push(caseEntity.id);

        const created = await recurrenceService.generateForAnchor(caseEntity, anchor);
        taskIds = created.map((t) => t.id);

        expect(created).toHaveLength(expectedDates.length);
        expect(created.map((t) => t.scheduledEndDate?.toISOString().slice(0, 10)).sort()).toEqual(
          [...expectedDates].sort(),
        );
        for (const task of created) {
          expect(task.caseId).toBe(caseEntity.id);
          expect(task.detail).toBe("template default detail");
          expect(task).not.toHaveProperty("memo");
          expect(task).not.toHaveProperty("scheduledDate");
          expect(Object.hasOwn(task, "scheduledEndDate")).toBe(true);
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
      await recurrenceService.stopTemplate(template.id, workspaceA);

      const caseEntity = await db.case.create({
        data: {
          name: `stopped-${randomUUID()}`,
          startDate: new Date("2036-07-01T00:00:00.000Z"),
          endDate: new Date("2036-07-20T00:00:00.000Z"),
        workspaceId: workspaceA,
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
        data: { date: new Date("2036-08-15T00:00:00.000Z"), source: "manual", label: "skip-day", workspaceId: workspaceA },
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
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      const skipped = await recurrenceService.generateForAnchor(caseEntity, "case_start");
      expect(skipped).toHaveLength(0);

      const nexted = await recurrenceService.generateForAnchor(caseEntity, "case_end");
      taskIds = nexted.map((t) => t.id);
      expect(nexted).toHaveLength(1);
      expect(nexted[0].scheduledEndDate?.toISOString().slice(0, 10)).toBe("2036-08-16");
    } finally {
      await cleanup({ taskIds, templateIds, caseIds, nonBusinessDayIds });
    }
  });

  it("policy=previous_business_day moves scheduledEndDate to the prior business day (Requirement 5.7)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    const nonBusinessDayIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const holiday = await db.nonBusinessDay.create({
        data: { date: new Date("2036-08-20T00:00:00.000Z"), source: "manual", label: "prev-day", workspaceId: workspaceA },
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
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      const created = await recurrenceService.generateForAnchor(caseEntity, "case_end");
      taskIds = created.map((t) => t.id);
      expect(created).toHaveLength(1);
      expect(created[0].scheduledEndDate?.toISOString().slice(0, 10)).toBe("2036-08-19");
    } finally {
      await cleanup({ taskIds, templateIds, caseIds, nonBusinessDayIds });
    }
  });

  it("editing one instance detail does not change template defaultDetail or sibling details (Requirement 5.8)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({
          title: "detail-independence",
          caseAnchor: "period_month_start",
          caseOffsetDays: 0,
          defaultDetail: "shared default",
          nonBusinessDayPolicy: "as_is",
        }),
      );
      templateIds.push(template.id);

      const caseEntity = await db.case.create({
        data: {
          name: `detail-${randomUUID()}`,
          startDate: new Date("2036-09-01T00:00:00.000Z"),
          endDate: new Date("2036-10-31T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      const created = await recurrenceService.generateForAnchor(caseEntity, "period_month_start");
      taskIds = created.map((t) => t.id);
      expect(created).toHaveLength(2);

      await db.task.update({
        where: { id: created[0].id },
        data: { detail: "edited just for this instance" },
      });

      const sibling = await db.task.findUnique({ where: { id: created[1].id } });
      const templateAfter = await db.recurringTaskTemplate.findUnique({ where: { id: template.id } });
      expect(sibling?.detail).toBe("shared default");
      expect(templateAfter?.defaultDetail).toBe("shared default");
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });
});

describe("recurrenceService.applyToCase (task 3.2, Requirements 3.2–3.4, 5.1–5.5)", () => {
  async function listActiveTasksForCase(caseId: string) {
    return db.task.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } });
  }

  it("start_generate creates tasks from active case_start templates (Requirement 3.2)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-start-gen", caseAnchor: "case_start", caseOffsetDays: 1 }),
      );
      templateIds.push(template.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-start-gen-${randomUUID()}`,
          startDate: new Date("2037-01-10T00:00:00.000Z"),
          endDate: null,
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["start_generate"]);

      const tasks = await listActiveTasksForCase(caseEntity.id);
      taskIds = tasks.map((t) => t.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].sourceAnchor).toBe("case_start");
      expect(tasks[0].scheduledEndDate?.toISOString().slice(0, 10)).toBe("2037-01-11");
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("end_generate creates tasks from active case_end templates (Requirement 3.3)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-end-gen", caseAnchor: "case_end", caseOffsetDays: 2 }),
      );
      templateIds.push(template.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-end-gen-${randomUUID()}`,
          startDate: null,
          endDate: new Date("2037-02-20T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["end_generate"]);

      const tasks = await listActiveTasksForCase(caseEntity.id);
      taskIds = tasks.map((t) => t.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].sourceAnchor).toBe("case_end");
      expect(tasks[0].scheduledEndDate?.toISOString().slice(0, 10)).toBe("2037-02-18");
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("month_generate creates tasks from active period_month_* templates (Requirement 3.4)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const startTpl = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-month-start", caseAnchor: "period_month_start", caseOffsetDays: 0 }),
      );
      const endTpl = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-month-end", caseAnchor: "period_month_end", caseOffsetDays: 0 }),
      );
      templateIds.push(startTpl.id, endTpl.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-month-gen-${randomUUID()}`,
          startDate: new Date("2037-03-15T00:00:00.000Z"),
          endDate: new Date("2037-04-10T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["month_generate"]);

      const tasks = await listActiveTasksForCase(caseEntity.id);
      taskIds = tasks.map((t) => t.id);
      const byAnchor = {
        period_month_start: tasks.filter((t) => t.sourceAnchor === "period_month_start"),
        period_month_end: tasks.filter((t) => t.sourceAnchor === "period_month_end"),
      };
      expect(byAnchor.period_month_start.map((t) => t.scheduledEndDate?.toISOString().slice(0, 10)).sort()).toEqual([
        "2037-04-01",
      ]);
      expect(byAnchor.period_month_end.map((t) => t.scheduledEndDate?.toISOString().slice(0, 10)).sort()).toEqual([
        "2037-03-31",
      ]);
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("start_delete soft-deletes case_start generated tasks including completed (Requirements 5.2, 5.5)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-start-del", caseAnchor: "case_start", caseOffsetDays: 0 }),
      );
      templateIds.push(template.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-start-del-${randomUUID()}`,
          startDate: new Date("2037-05-01T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["start_generate"]);
      const before = await listActiveTasksForCase(caseEntity.id);
      taskIds = before.map((t) => t.id);
      expect(before).toHaveLength(1);

      await db.task.update({ where: { id: before[0].id }, data: { status: "ready_for_handoff", completedAt: new Date() } });

      await recurrenceService.applyToCase(caseEntity.id, ["start_delete"]);

      const active = await listActiveTasksForCase(caseEntity.id);
      expect(active).toHaveLength(0);
      const softDeleted = await db.task.findFirst({
        where: { id: before[0].id, deletedAt: { not: null } },
      });
      expect(softDeleted).not.toBeNull();
      expect(softDeleted?.deletedAt).toBeInstanceOf(Date);
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("end_delete soft-deletes case_end generated tasks (Requirement 5.2)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-end-del", caseAnchor: "case_end", caseOffsetDays: 0 }),
      );
      templateIds.push(template.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-end-del-${randomUUID()}`,
          endDate: new Date("2037-06-15T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["end_generate"]);
      const before = await listActiveTasksForCase(caseEntity.id);
      taskIds = before.map((t) => t.id);
      expect(before).toHaveLength(1);

      await recurrenceService.applyToCase(caseEntity.id, ["end_delete"]);

      expect(await listActiveTasksForCase(caseEntity.id)).toHaveLength(0);
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("month_delete soft-deletes both period_month_* generated tasks (Requirement 5.2)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      templateIds.push(
        (
          await recurrenceService.registerTemplate(
            baseInput({ title: "apply-month-del-s", caseAnchor: "period_month_start", caseOffsetDays: 0 }),
          )
        ).id,
        (
          await recurrenceService.registerTemplate(
            baseInput({ title: "apply-month-del-e", caseAnchor: "period_month_end", caseOffsetDays: 0 }),
          )
        ).id,
      );
      const caseEntity = await db.case.create({
        data: {
          name: `apply-month-del-${randomUUID()}`,
          startDate: new Date("2037-07-01T00:00:00.000Z"),
          endDate: new Date("2037-07-31T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["month_generate"]);
      const before = await listActiveTasksForCase(caseEntity.id);
      taskIds = before.map((t) => t.id);
      expect(before.length).toBeGreaterThanOrEqual(2);

      await recurrenceService.applyToCase(caseEntity.id, ["month_delete"]);

      expect(await listActiveTasksForCase(caseEntity.id)).toHaveLength(0);
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("start_regenerate deletes then regenerates case_start tasks for the new date (Requirement 5.2)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-start-regen", caseAnchor: "case_start", caseOffsetDays: 0 }),
      );
      templateIds.push(template.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-start-regen-${randomUUID()}`,
          startDate: new Date("2037-08-01T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["start_generate"]);
      const first = await listActiveTasksForCase(caseEntity.id);
      expect(first).toHaveLength(1);
      expect(first[0].scheduledEndDate?.toISOString().slice(0, 10)).toBe("2037-08-01");
      const oldId = first[0].id;

      await db.case.update({
        where: { id: caseEntity.id },
        data: { startDate: new Date("2037-08-10T00:00:00.000Z") },
      });

      await recurrenceService.applyToCase(caseEntity.id, ["start_regenerate"]);

      const after = await listActiveTasksForCase(caseEntity.id);
      taskIds = [...after.map((t) => t.id), oldId];
      expect(after).toHaveLength(1);
      expect(after[0].id).not.toBe(oldId);
      expect(after[0].scheduledEndDate?.toISOString().slice(0, 10)).toBe("2037-08-10");
      const softDeleted = await db.task.findFirst({ where: { id: oldId, deletedAt: { not: null } } });
      expect(softDeleted).not.toBeNull();
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("end_regenerate deletes then regenerates case_end tasks (Requirement 5.2)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-end-regen", caseAnchor: "case_end", caseOffsetDays: 0 }),
      );
      templateIds.push(template.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-end-regen-${randomUUID()}`,
          endDate: new Date("2037-09-20T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["end_generate"]);
      const first = await listActiveTasksForCase(caseEntity.id);
      const oldId = first[0].id;

      await db.case.update({
        where: { id: caseEntity.id },
        data: { endDate: new Date("2037-09-25T00:00:00.000Z") },
      });

      await recurrenceService.applyToCase(caseEntity.id, ["end_regenerate"]);

      const after = await listActiveTasksForCase(caseEntity.id);
      taskIds = [...after.map((t) => t.id), oldId];
      expect(after).toHaveLength(1);
      expect(after[0].scheduledEndDate?.toISOString().slice(0, 10)).toBe("2037-09-25");
      expect(after[0].id).not.toBe(oldId);
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("month_regenerate deletes then regenerates period_month_* tasks (Requirement 5.2)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      templateIds.push(
        (
          await recurrenceService.registerTemplate(
            baseInput({ title: "apply-month-regen-s", caseAnchor: "period_month_start", caseOffsetDays: 0 }),
          )
        ).id,
      );
      const caseEntity = await db.case.create({
        data: {
          name: `apply-month-regen-${randomUUID()}`,
          startDate: new Date("2037-10-01T00:00:00.000Z"),
          endDate: new Date("2037-10-31T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["month_generate"]);
      const first = await listActiveTasksForCase(caseEntity.id);
      expect(first).toHaveLength(1);
      const oldId = first[0].id;

      await db.case.update({
        where: { id: caseEntity.id },
        data: {
          startDate: new Date("2037-11-01T00:00:00.000Z"),
          endDate: new Date("2037-11-30T00:00:00.000Z"),
        },
      });

      await recurrenceService.applyToCase(caseEntity.id, ["month_regenerate"]);

      const after = await listActiveTasksForCase(caseEntity.id);
      taskIds = [...after.map((t) => t.id), oldId];
      expect(after).toHaveLength(1);
      expect(after[0].scheduledEndDate?.toISOString().slice(0, 10)).toBe("2037-11-01");
      expect(after[0].id).not.toBe(oldId);
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("does not delete manual tasks when deleting by sourceAnchor (Requirement 5.4)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-manual", caseAnchor: "case_start", caseOffsetDays: 0 }),
      );
      templateIds.push(template.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-manual-${randomUUID()}`,
          startDate: new Date("2037-12-01T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["start_generate"]);
      const generated = await listActiveTasksForCase(caseEntity.id);
      expect(generated).toHaveLength(1);

      const manual = await db.task.create({
        data: {
          title: "manual task",
          priority: "medium",
          caseId: caseEntity.id,
          scheduledEndDate: new Date("2037-12-01T00:00:00.000Z"),
          workspaceId: workspaceA,
        },
      });
      taskIds = [generated[0].id, manual.id];

      await recurrenceService.applyToCase(caseEntity.id, ["start_delete"]);

      const remaining = await listActiveTasksForCase(caseEntity.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(manual.id);
      expect(remaining[0].sourceTemplateId).toBeNull();
      expect(remaining[0].sourceAnchor).toBeNull();
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("stopped templates are unused for generate, but prior generated tasks remain deletable (Requirements 5.1, 5.3)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-stopped", caseAnchor: "case_end", caseOffsetDays: 0 }),
      );
      templateIds.push(template.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-stopped-${randomUUID()}`,
          endDate: new Date("2038-01-15T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["end_generate"]);
      const before = await listActiveTasksForCase(caseEntity.id);
      taskIds = before.map((t) => t.id);
      expect(before).toHaveLength(1);

      await recurrenceService.stopTemplate(template.id, workspaceA);

      // generate must not create new instances from stopped templates
      await recurrenceService.applyToCase(caseEntity.id, ["end_generate"]);
      expect(await listActiveTasksForCase(caseEntity.id)).toHaveLength(1);

      // delete still targets previously generated tasks regardless of template activity
      await recurrenceService.applyToCase(caseEntity.id, ["end_delete"]);
      expect(await listActiveTasksForCase(caseEntity.id)).toHaveLength(0);
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("active unique collision on generate is an idempotent no-op (Requirement 5.5)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(
        baseInput({ title: "apply-idempotent", caseAnchor: "case_start", caseOffsetDays: 0 }),
      );
      templateIds.push(template.id);
      const caseEntity = await db.case.create({
        data: {
          name: `apply-idempotent-${randomUUID()}`,
          startDate: new Date("2038-02-01T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["start_generate"]);
      const first = await listActiveTasksForCase(caseEntity.id);
      taskIds = first.map((t) => t.id);
      expect(first).toHaveLength(1);

      await expect(recurrenceService.applyToCase(caseEntity.id, ["start_generate"])).resolves.toBeUndefined();

      const second = await listActiveTasksForCase(caseEntity.id);
      expect(second).toHaveLength(1);
      expect(second[0].id).toBe(first[0].id);
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });

  it("empty operations is a no-op", async () => {
    const caseIds: string[] = [];
    try {
      const caseEntity = await db.case.create({
        data: {
          name: `apply-empty-${randomUUID()}`,
          startDate: new Date("2038-03-01T00:00:00.000Z"),
        workspaceId: workspaceA,
        },
      });
      caseIds.push(caseEntity.id);

      await expect(recurrenceService.applyToCase(caseEntity.id, [])).resolves.toBeUndefined();
      expect(await listActiveTasksForCase(caseEntity.id)).toHaveLength(0);
    } finally {
      await cleanup({ caseIds });
    }
  });
});

describe("recurrenceService workspace scope (workspace-resource-scope 4.1)", () => {
  it("registerTemplate attributes the template to the given workspace (Requirement 1.1, 1.2)", async () => {
    const templateIds: string[] = [];
    try {
      const template = await recurrenceService.registerTemplate(baseInput({ title: "ws-create", workspaceId: workspaceB }));
      templateIds.push(template.id);
      expect(template.workspaceId).toBe(workspaceB);
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("list returns only templates in the current workspace (Requirement 3.1)", async () => {
    const templateIds: string[] = [];
    try {
      const inA = await recurrenceService.registerTemplate(baseInput({ title: "list-a", workspaceId: workspaceA }));
      const inB = await recurrenceService.registerTemplate(baseInput({ title: "list-b", workspaceId: workspaceB }));
      templateIds.push(inA.id, inB.id);

      const listA = await recurrenceService.list(workspaceA);
      expect(listA.some((t) => t.id === inA.id)).toBe(true);
      expect(listA.some((t) => t.id === inB.id)).toBe(false);
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("stop / resume / delete on another workspace template return 404 (Requirement 3.3)", async () => {
    const templateIds: string[] = [];
    try {
      const inB = await recurrenceService.registerTemplate(baseInput({ title: "foreign", workspaceId: workspaceB }));
      templateIds.push(inB.id);

      await expect(recurrenceService.stopTemplate(inB.id, workspaceA)).rejects.toMatchObject({ statusCode: 404 });
      await expect(recurrenceService.resumeTemplate(inB.id, workspaceA)).rejects.toMatchObject({ statusCode: 404 });
      await expect(recurrenceService.deleteTemplate(inB.id, workspaceA)).rejects.toMatchObject({ statusCode: 404 });

      const stillThere = await recurrenceService.list(workspaceB);
      expect(stillThere.some((t) => t.id === inB.id)).toBe(true);
    } finally {
      await cleanup({ templateIds });
    }
  });

  it("applyToCase ignores templates from a different workspace and attributes generated tasks to the case workspace (Requirements 1.3, 3.1)", async () => {
    const templateIds: string[] = [];
    const caseIds: string[] = [];
    let taskIds: string[] = [];
    try {
      const foreign = await recurrenceService.registerTemplate(
        baseInput({
          title: "foreign-apply",
          caseAnchor: "case_start",
          caseOffsetDays: 0,
          workspaceId: workspaceB,
        }),
      );
      const local = await recurrenceService.registerTemplate(
        baseInput({
          title: "local-apply",
          caseAnchor: "case_start",
          caseOffsetDays: 1,
          workspaceId: workspaceA,
        }),
      );
      templateIds.push(foreign.id, local.id);

      const caseEntity = await createCase({
        name: `apply-ws-${randomUUID()}`,
        startDate: new Date("2039-01-10T00:00:00.000Z"),
        endDate: new Date("2039-01-31T00:00:00.000Z"),
        workspaceId: workspaceA,
      });
      caseIds.push(caseEntity.id);

      await recurrenceService.applyToCase(caseEntity.id, ["start_generate"]);

      const tasks = await db.task.findMany({ where: { caseId: caseEntity.id }, orderBy: { createdAt: "asc" } });
      taskIds = tasks.map((t) => t.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].sourceTemplateId).toBe(local.id);
      expect(tasks[0].workspaceId).toBe(workspaceA);
      expect(tasks[0].workspaceId).toBe(caseEntity.workspaceId);
    } finally {
      await cleanup({ taskIds, templateIds, caseIds });
    }
  });
});

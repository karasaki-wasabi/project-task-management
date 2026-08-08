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
import { recurrenceService } from "./recurrence.service.js";
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

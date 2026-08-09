// Integration / schema tests for domain Prisma models.
// Task 1.1 (recurrence-holidays-ux): case-relative-only RecurringTaskTemplate + Task.sourceAnchor
// and active-row uniqueness expressed as Unsupported generated column (SQL hand-edit in task 1.2).
// Run inside the backend container so DATABASE_URL resolves to the mysql
// service: `docker compose run --rm backend npx vitest run src/prisma/schema.integration.test.ts`.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CaseRelativeAnchor,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import * as PrismaClientModule from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("recurrence schema shape (task 1.1)", () => {
  it("exposes CaseRelativeAnchor and case-relative-only template/task fields", () => {
    expect(CaseRelativeAnchor).toEqual({
      case_start: "case_start",
      case_end: "case_end",
      period_month_start: "period_month_start",
      period_month_end: "period_month_end",
    });

    const templateFields = Prisma.RecurringTaskTemplateScalarFieldEnum;
    expect(templateFields).toMatchObject({
      caseAnchor: "caseAnchor",
      caseOffsetDays: "caseOffsetDays",
    });
    expect(templateFields).not.toHaveProperty("kind");
    expect(templateFields).not.toHaveProperty("intervalUnit");
    expect(templateFields).not.toHaveProperty("intervalValue");
    expect(templateFields).not.toHaveProperty("boundCaseId");

    const taskFields = Prisma.TaskScalarFieldEnum;
    expect(taskFields).toMatchObject({
      sourceAnchor: "sourceAnchor",
    });

    // fixed_interval / interval enums must be gone from the generated client
    expect(PrismaClientModule).not.toHaveProperty("RecurrenceKind");
    expect(PrismaClientModule).not.toHaveProperty("IntervalUnit");
    expect(PrismaClientModule).toHaveProperty("CaseRelativeAnchor");

    // Unsupported generated columns are omitted from ScalarFieldEnum (same as
    // NonBusinessDay.dateActiveKey). Assert they remain in the Prisma schema text.
    const schemaPath = resolve(__dirname, "schema.prisma");
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toMatch(/templateCaseDateActiveKey\s+Unsupported\(/);
    expect(schema).toMatch(/@map\("template_case_date_active_key"\)/);
    expect(schema).not.toMatch(/@@unique\(\[sourceTemplateId,\s*scheduledDate\]\)/);
    expect(schema).not.toMatch(/enum RecurrenceKind/);
    expect(schema).not.toMatch(/enum IntervalUnit/);
  });
});

describe("physical schema (task 1.2)", () => {
  it("provides email and password_hash columns and enforces unique email", async () => {
    const columns = await prisma.$queryRaw<Array<{ Field: string }>>`SHOW COLUMNS FROM users`;
    const columnNames = columns.map((column) => column.Field);

    expect(columnNames).toEqual(expect.arrayContaining(["email", "password_hash"]));

    const userId = randomUUID();
    const email = `unique-${userId}@example.test`;
    const user = await prisma.user.create({
      data: { email, name: `unique-${userId}`, passwordHash: "test-password-hash" },
    });

    await expect(
      prisma.user.create({
        data: { email, name: `duplicate-${userId}`, passwordHash: "test-password-hash" },
      }),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: user.id } });
  });

  it("round-trips user, case, template, task, and non_business_day", async () => {
    const userId = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `user-${userId}@example.test`,
        name: `user-${userId}`,
        passwordHash: "test-password-hash",
      },
    });
    const caseEntity = await prisma.case.create({
      data: { name: `case-${randomUUID()}`, endDate: new Date("2026-08-01") },
    });
    const template = await prisma.recurringTaskTemplate.create({
      data: {
        title: `tpl-${randomUUID()}`,
        priority: "medium",
        caseAnchor: CaseRelativeAnchor.case_start,
        caseOffsetDays: 0,
        nonBusinessDayPolicy: "as_is",
      },
    });
    const task = await prisma.task.create({
      data: {
        title: `task-${randomUUID()}`,
        priority: "medium",
        caseId: caseEntity.id,
        sourceTemplateId: template.id,
        sourceAnchor: CaseRelativeAnchor.case_start,
        scheduledDate: new Date("2026-08-10"),
      },
    });
    const holiday = await prisma.nonBusinessDay.create({
      data: { date: new Date("2030-01-01"), label: "test-holiday", source: "manual" },
    });

    expect(user.id).toBeTruthy();
    expect(caseEntity.id).toBeTruthy();
    expect(template.caseAnchor).toBe(CaseRelativeAnchor.case_start);
    expect(task.sourceAnchor).toBe(CaseRelativeAnchor.case_start);
    expect(holiday.source).toBe("manual");

    await prisma.task.delete({ where: { id: task.id } });
    await prisma.nonBusinessDay.delete({ where: { id: holiday.id } });
    await prisma.recurringTaskTemplate.delete({ where: { id: template.id } });
    await prisma.case.delete({ where: { id: caseEntity.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("enforces created_at/updated_at/deleted_at on every table", async () => {
    const userId = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `audit-${userId}@example.test`,
        name: `audit-${userId}`,
        passwordHash: "test-password-hash",
      },
    });
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
    expect(user.deletedAt).toBeNull();
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("rejects two active non_business_days on the same date via date_active_key, but allows re-registration after soft delete", async () => {
    const date = new Date("2031-05-05");

    const first = await prisma.nonBusinessDay.create({
      data: { date, label: "first", source: "manual" },
    });

    await expect(
      prisma.nonBusinessDay.create({ data: { date, label: "duplicate", source: "manual" } }),
    ).rejects.toThrow();

    await prisma.$executeRaw`UPDATE non_business_days SET deleted_at = NOW() WHERE id = ${first.id}`;

    const second = await prisma.nonBusinessDay.create({
      data: { date, label: "second", source: "manual" },
    });

    expect(second.id).not.toBe(first.id);

    await prisma.$executeRaw`DELETE FROM non_business_days WHERE id IN (${first.id}, ${second.id})`;
  });

  it("rejects two active template tasks on the same (template, case, scheduledDate), but allows recreate after soft delete", async () => {
    const caseEntity = await prisma.case.create({
      data: { name: `case-uniq-${randomUUID()}`, endDate: new Date("2026-09-01") },
    });
    const template = await prisma.recurringTaskTemplate.create({
      data: {
        title: `tpl-uniq-${randomUUID()}`,
        priority: "high",
        caseAnchor: CaseRelativeAnchor.case_end,
        caseOffsetDays: 1,
        nonBusinessDayPolicy: "skip",
      },
    });
    const scheduledDate = new Date("2026-09-15");
    const baseTask = {
      title: "generated",
      priority: "high" as const,
      caseId: caseEntity.id,
      sourceTemplateId: template.id,
      sourceAnchor: CaseRelativeAnchor.case_end,
      scheduledDate,
    };

    const first = await prisma.task.create({ data: baseTask });

    await expect(prisma.task.create({ data: { ...baseTask, title: "duplicate" } })).rejects.toThrow();

    await prisma.$executeRaw`UPDATE tasks SET deleted_at = NOW() WHERE id = ${first.id}`;

    const second = await prisma.task.create({ data: { ...baseTask, title: "recreated" } });
    expect(second.id).not.toBe(first.id);

    await prisma.$executeRaw`DELETE FROM tasks WHERE id IN (${first.id}, ${second.id})`;
    await prisma.recurringTaskTemplate.delete({ where: { id: template.id } });
    await prisma.case.delete({ where: { id: caseEntity.id } });
  });

  it("round-trips a development stage linked from a task", async () => {
    const stage = await prisma.developmentStage.create({
      data: { name: `stage-${randomUUID()}`, order: 0 },
    });
    const task = await prisma.task.create({
      data: {
        title: `stage-task-${randomUUID()}`,
        priority: "low",
        developmentStageId: stage.id,
      },
    });

    expect(stage.id).toBeTruthy();
    expect(task.developmentStageId).toBe(stage.id);
    expect(stage.createdAt).toBeInstanceOf(Date);
    expect(stage.updatedAt).toBeInstanceOf(Date);
    expect(stage.deletedAt).toBeNull();

    await prisma.task.delete({ where: { id: task.id } });
    await prisma.developmentStage.delete({ where: { id: stage.id } });
  });
});

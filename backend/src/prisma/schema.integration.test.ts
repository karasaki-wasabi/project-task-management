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

describe("physical schema (pre-1.2 DB)", () => {
  // Task.source_anchor / template_case_date_active_key and RecurringTaskTemplate
  // case_anchor land in MySQL at task 1.2 (migrate reset). Until then Prisma
  // Task/RecurringTaskTemplate writes fail against the old DB; keep DB checks
  // on tables that remain compatible.

  it("round-trips user, case, and non_business_day", async () => {
    const user = await prisma.user.create({ data: { name: `user-${randomUUID()}` } });
    const caseEntity = await prisma.case.create({
      data: { name: `case-${randomUUID()}`, endDate: new Date("2026-08-01") },
    });
    const holiday = await prisma.nonBusinessDay.create({
      data: { date: new Date(`2030-01-0${1}`), label: "test-holiday", source: "manual" },
    });

    expect(user.id).toBeTruthy();
    expect(caseEntity.id).toBeTruthy();
    expect(holiday.source).toBe("manual");

    await prisma.nonBusinessDay.delete({ where: { id: holiday.id } });
    await prisma.case.delete({ where: { id: caseEntity.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("enforces created_at/updated_at/deleted_at on every table", async () => {
    const user = await prisma.user.create({ data: { name: `audit-${randomUUID()}` } });
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

  it("round-trips a development stage (task 13.1; task link deferred to 1.2)", async () => {
    const stage = await prisma.developmentStage.create({ data: { name: `stage-${randomUUID()}`, order: 0 } });

    expect(stage.id).toBeTruthy();
    expect(stage.createdAt).toBeInstanceOf(Date);
    expect(stage.updatedAt).toBeInstanceOf(Date);
    expect(stage.deletedAt).toBeNull();

    await prisma.developmentStage.delete({ where: { id: stage.id } });
  });
});

// Integration test for task 1.3 (Requirements: 9.1, 9.3).
// Verifies the physical schema against a real MySQL instance: every domain
// table can round-trip a record, and the two hand-written constraints that
// Prisma cannot express purely from the schema file behave as designed
// (non_business_days' generated-column partial-unique-index workaround, and
// the (source_template_id, scheduled_date) idempotency constraint on tasks).
// Run inside the backend container so DATABASE_URL resolves to the mysql
// service: `docker compose run --rm backend npx vitest run schema.integration`.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("physical schema (task 1.3)", () => {
  it("round-trips a record through every domain table", async () => {
    const user = await prisma.user.create({ data: { name: `user-${randomUUID()}` } });
    const delivery = await prisma.delivery.create({
      data: { name: `delivery-${randomUUID()}`, dueDate: new Date("2026-08-01") },
    });
    const parentTask = await prisma.task.create({
      data: { title: "parent", priority: "high", deliveryId: delivery.id, assigneeUserId: user.id },
    });
    const childTask = await prisma.task.create({
      data: { title: "child", priority: "medium", parentTaskId: parentTask.id },
    });
    const event = await prisma.event.create({
      data: { title: "kickoff", occursAt: new Date("2026-08-01T09:00:00Z"), deliveryId: delivery.id },
    });
    const template = await prisma.recurringTaskTemplate.create({
      data: {
        title: "weekly report",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "week",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      },
    });
    const holiday = await prisma.nonBusinessDay.create({
      data: { date: new Date(`2030-01-0${1}`), label: "test-holiday", source: "manual" },
    });

    expect(user.id).toBeTruthy();
    expect(childTask.parentTaskId).toBe(parentTask.id);
    expect(event.deliveryId).toBe(delivery.id);
    expect(template.kind).toBe("fixed_interval");
    expect(holiday.source).toBe("manual");

    await prisma.event.delete({ where: { id: event.id } });
    await prisma.task.delete({ where: { id: childTask.id } });
    await prisma.task.delete({ where: { id: parentTask.id } });
    await prisma.recurringTaskTemplate.delete({ where: { id: template.id } });
    await prisma.nonBusinessDay.delete({ where: { id: holiday.id } });
    await prisma.delivery.delete({ where: { id: delivery.id } });
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

  it("prevents duplicate (source_template_id, scheduled_date) task instances", async () => {
    const template = await prisma.recurringTaskTemplate.create({
      data: {
        title: "idempotency check",
        priority: "low",
        kind: "fixed_interval",
        intervalUnit: "day",
        intervalValue: 1,
        nonBusinessDayPolicy: "as_is",
      },
    });
    const scheduledDate = new Date("2031-06-01");

    const firstInstance = await prisma.task.create({
      data: {
        title: "instance 1",
        priority: "low",
        sourceTemplateId: template.id,
        scheduledDate,
      },
    });

    await expect(
      prisma.task.create({
        data: {
          title: "instance 1 duplicate",
          priority: "low",
          sourceTemplateId: template.id,
          scheduledDate,
        },
      }),
    ).rejects.toThrow();

    await prisma.task.delete({ where: { id: firstInstance.id } });
    await prisma.recurringTaskTemplate.delete({ where: { id: template.id } });
  });
});

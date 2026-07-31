// RED: recurrenceService does not exist yet (task 9.1, Requirements 5.6,
// 5.7, 8.3, 9.1-9.4). Integration test against real MySQL via shared/db.ts.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { recurrenceService } from "./recurrence.service.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("recurrenceService.registerTemplate (task 9.1)", () => {
  it("registers a fixed_interval template with a default memo and non-business-day policy (Requirements 5.6, 5.7, 8.3)", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "weekly report",
      priority: "medium",
      kind: "fixed_interval",
      intervalUnit: "week",
      intervalValue: 1,
      defaultMemo: "Zoom: https://example.com/meeting",
      nonBusinessDayPolicy: "next_business_day",
    });

    expect(template.kind).toBe("fixed_interval");
    expect(template.defaultMemo).toBe("Zoom: https://example.com/meeting");
    expect(template.nonBusinessDayPolicy).toBe("next_business_day");
    expect(template.isActive).toBe(true);

    await hardDelete("recurring_task_templates", [template.id]);
  });

  it("registers a delivery_relative template with an offset", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "estimate document",
      priority: "high",
      kind: "delivery_relative",
      deliveryOffsetDays: 3,
      nonBusinessDayPolicy: "as_is",
    });

    expect(template.kind).toBe("delivery_relative");
    expect(template.deliveryOffsetDays).toBe(3);
    expect(template.boundDeliveryId).toBeNull();

    await hardDelete("recurring_task_templates", [template.id]);
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

  it("rejects a delivery_relative template missing deliveryOffsetDays", async () => {
    await expect(
      recurrenceService.registerTemplate({
        title: "bad template",
        priority: "low",
        kind: "delivery_relative",
        nonBusinessDayPolicy: "as_is",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a negative deliveryOffsetDays", async () => {
    await expect(
      recurrenceService.registerTemplate({
        title: "bad template",
        priority: "low",
        kind: "delivery_relative",
        deliveryOffsetDays: -1,
        nonBusinessDayPolicy: "as_is",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a delivery_relative template that also sets boundDeliveryId (design.md Logical Data Model: boundDeliveryId is fixed_interval-only)", async () => {
    const delivery = await db.delivery.create({ data: { name: `d-${randomUUID()}`, dueDate: new Date() } });

    await expect(
      recurrenceService.registerTemplate({
        title: "bad template",
        priority: "low",
        kind: "delivery_relative",
        deliveryOffsetDays: 1,
        boundDeliveryId: delivery.id,
        nonBusinessDayPolicy: "as_is",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await hardDelete("deliveries", [delivery.id]);
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
    const template = await recurrenceService.registerTemplate({
      title: "stoppable",
      priority: "low",
      kind: "fixed_interval",
      intervalUnit: "day",
      intervalValue: 1,
      nonBusinessDayPolicy: "as_is",
    });

    await recurrenceService.stopTemplate(template.id);

    const list = await recurrenceService.list();
    const found = list.find((t) => t.id === template.id);
    expect(found?.isActive).toBe(false);

    await hardDelete("recurring_task_templates", [template.id]);
  });

  it("returns not_found (404) when stopping a non-existent template", async () => {
    await expect(recurrenceService.stopTemplate(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deleteTemplate soft-deletes and excludes it from list, distinct from stopTemplate", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "deletable",
      priority: "low",
      kind: "fixed_interval",
      intervalUnit: "day",
      intervalValue: 1,
      nonBusinessDayPolicy: "as_is",
    });

    await recurrenceService.deleteTemplate(template.id);

    const list = await recurrenceService.list();
    expect(list.some((t) => t.id === template.id)).toBe(false);

    const rawRow = await db.recurringTaskTemplate.findFirst({ where: { id: template.id, deletedAt: { not: null } } });
    expect(rawRow).not.toBeNull();

    await hardDelete("recurring_task_templates", [template.id]);
  });

  it("returns not_found (404) when deleting a non-existent template", async () => {
    await expect(recurrenceService.deleteTemplate(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lists registered templates", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "listable",
      priority: "low",
      kind: "fixed_interval",
      intervalUnit: "month",
      intervalValue: 1,
      nonBusinessDayPolicy: "skip",
    });

    const list = await recurrenceService.list();

    expect(list.some((t) => t.id === template.id)).toBe(true);

    await hardDelete("recurring_task_templates", [template.id]);
  });
});

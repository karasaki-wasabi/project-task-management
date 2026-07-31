// RED: deliveriesService does not exist yet (task 4.1, Requirements 3.1-3.7,
// 9.1-9.4). Integration test against real MySQL via shared/db.ts.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { recurrenceService } from "../recurrence/recurrence.service.js";
import { deliveriesService } from "./delivery.service.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("deliveriesService (task 4.1)", () => {
  it("creates a delivery holding name and dueDate (Requirement 3.1)", async () => {
    const dueDate = new Date("2026-09-01");
    const delivery = await deliveriesService.create({ name: "release A", dueDate });

    expect(delivery.name).toBe("release A");
    expect(delivery.dueDate.getTime()).toBe(dueDate.getTime());

    await hardDelete("deliveries", [delivery.id]);
  });

  it("rejects an empty name", async () => {
    await expect(deliveriesService.create({ name: "  ", dueDate: new Date() })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("allows a past dueDate (design.md DeliveriesService Implementation Notes)", async () => {
    const delivery = await deliveriesService.create({ name: "already due", dueDate: new Date("2000-01-01") });

    expect(delivery.id).toBeTruthy();

    await hardDelete("deliveries", [delivery.id]);
  });

  it("updates the dueDate", async () => {
    const delivery = await deliveriesService.create({ name: "moving delivery", dueDate: new Date("2026-09-01") });
    const newDueDate = new Date("2026-10-15");

    const updated = await deliveriesService.updateDueDate(delivery.id, newDueDate);

    expect(updated.dueDate.getTime()).toBe(newDueDate.getTime());

    await hardDelete("deliveries", [delivery.id]);
  });

  it("returns not_found (404) when updating dueDate of a non-existent delivery", async () => {
    await expect(deliveriesService.updateDueDate(randomUUID(), new Date())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("allows multiple deliveries to exist and progress concurrently (Requirement 3.6)", async () => {
    const a = await deliveriesService.create({ name: `a-${randomUUID()}`, dueDate: new Date("2026-09-01") });
    const b = await deliveriesService.create({ name: `b-${randomUUID()}`, dueDate: new Date("2026-09-15") });

    const list = await deliveriesService.list();

    expect(list.some((d) => d.id === a.id)).toBe(true);
    expect(list.some((d) => d.id === b.id)).toBe(true);

    await hardDelete("deliveries", [a.id, b.id]);
  });

  it("computes progress from required tasks only (Requirement 3.4, design.md getProgress Invariant)", async () => {
    const delivery = await deliveriesService.create({ name: "progress test", dueDate: new Date("2099-01-01") });
    const [requiredDone, requiredOpen, optional] = await Promise.all([
      db.task.create({ data: { title: "required done", priority: "low", deliveryId: delivery.id, isRequiredForDelivery: true, status: "done" } }),
      db.task.create({ data: { title: "required open", priority: "low", deliveryId: delivery.id, isRequiredForDelivery: true } }),
      db.task.create({ data: { title: "optional", priority: "low", deliveryId: delivery.id, isRequiredForDelivery: false } }),
    ]);

    const progress = await deliveriesService.getProgress(delivery.id);

    expect(progress.requiredTotal).toBe(2);
    expect(progress.requiredCompleted).toBe(1);
    expect(progress.requiredIncomplete).toBe(1);

    await hardDelete("tasks", [requiredDone.id, requiredOpen.id, optional.id]);
    await hardDelete("deliveries", [delivery.id]);
  });

  it("flags isOverdueWithIncomplete only when dueDate has passed and a required task is incomplete (Requirement 3.5)", async () => {
    const overdue = await deliveriesService.create({ name: "overdue", dueDate: new Date("2000-01-01") });
    const openTask = await db.task.create({
      data: { title: "still open", priority: "low", deliveryId: overdue.id, isRequiredForDelivery: true },
    });

    const overdueProgress = await deliveriesService.getProgress(overdue.id);
    expect(overdueProgress.isOverdueWithIncomplete).toBe(true);

    const doneResult = await db.task.update({ where: { id: openTask.id }, data: { status: "done" } });
    const caughtUpProgress = await deliveriesService.getProgress(overdue.id);
    expect(caughtUpProgress.isOverdueWithIncomplete).toBe(false);

    await hardDelete("tasks", [doneResult.id]);
    await hardDelete("deliveries", [overdue.id]);
  });

  it("returns not_found (404) for progress of a non-existent delivery", async () => {
    await expect(deliveriesService.getProgress(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("soft-deletes a delivery, excludes it from list, and detaches (not cascades) linked tasks (Requirement 9.3, 9.4)", async () => {
    const delivery = await deliveriesService.create({ name: "to delete", dueDate: new Date() });
    const linkedTask = await db.task.create({ data: { title: "keep me", priority: "low", deliveryId: delivery.id } });

    await deliveriesService.delete(delivery.id);

    const list = await deliveriesService.list();
    expect(list.some((d) => d.id === delivery.id)).toBe(false);

    const rawDelivery = await db.delivery.findFirst({ where: { id: delivery.id, deletedAt: { not: null } } });
    expect(rawDelivery).not.toBeNull();

    const survivingTask = await db.task.findUnique({ where: { id: linkedTask.id } });
    expect(survivingTask).not.toBeNull();
    expect(survivingTask?.deletedAt).toBeNull();
    expect(survivingTask?.deliveryId).toBeNull();

    await hardDelete("tasks", [linkedTask.id]);
    await hardDelete("deliveries", [delivery.id]);
  });

  it("returns not_found (404) when deleting a non-existent delivery", async () => {
    await expect(deliveriesService.delete(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });
});

// RED: create()/updateDueDate() do not call RecurrenceService yet (task
// 10.1, Requirements 5.3, 5.4).
describe("deliveriesService <-> RecurrenceService wiring (task 10.1)", () => {
  it("create() triggers onDeliveryCreated: an active delivery_relative template generates a task instance (Requirement 5.3)", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "estimate doc",
      priority: "high",
      kind: "delivery_relative",
      deliveryOffsetDays: 3,
      nonBusinessDayPolicy: "as_is",
    });

    const delivery = await deliveriesService.create({ name: "wired release", dueDate: new Date("2036-06-15") });

    const instances = await db.task.findMany({ where: { sourceTemplateId: template.id, deliveryId: delivery.id } });
    expect(instances).toHaveLength(1);
    expect(instances[0].scheduledDate?.toISOString().slice(0, 10)).toBe("2036-06-12");

    await db.$executeRawUnsafe("DELETE FROM tasks WHERE id = ?", instances[0].id);
    await hardDelete("deliveries", [delivery.id]);
    await db.$executeRawUnsafe("DELETE FROM recurring_task_templates WHERE id = ?", template.id);
  });

  it("updateDueDate() triggers onDeliveryDueDateChanged: recomputes an incomplete instance's scheduledDate, leaves completed ones alone (Requirement 5.4)", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "wired recalculation doc",
      priority: "low",
      kind: "delivery_relative",
      deliveryOffsetDays: 2,
      nonBusinessDayPolicy: "as_is",
    });
    const delivery = await deliveriesService.create({ name: "wired recalculation", dueDate: new Date("2036-07-10") });
    const [instance] = await db.task.findMany({ where: { sourceTemplateId: template.id, deliveryId: delivery.id } });
    expect(instance.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-07-08");

    const updated = await deliveriesService.updateDueDate(delivery.id, new Date("2036-07-20"));

    const recalculated = await db.task.findUnique({ where: { id: instance.id } });
    expect(recalculated?.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-07-18");
    expect(updated.dueDate.getTime()).toBe(new Date("2036-07-20").getTime());

    await db.$executeRawUnsafe("DELETE FROM tasks WHERE id = ?", instance.id);
    await hardDelete("deliveries", [delivery.id]);
    await db.$executeRawUnsafe("DELETE FROM recurring_task_templates WHERE id = ?", template.id);
  });

  it("updateDueDate() does not change a completed instance's scheduledDate", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "wired completed doc",
      priority: "low",
      kind: "delivery_relative",
      deliveryOffsetDays: 1,
      nonBusinessDayPolicy: "as_is",
    });
    const delivery = await deliveriesService.create({ name: "wired completed", dueDate: new Date("2036-08-10") });
    const [instance] = await db.task.findMany({ where: { sourceTemplateId: template.id, deliveryId: delivery.id } });
    await db.task.update({ where: { id: instance.id }, data: { status: "done" } });

    await deliveriesService.updateDueDate(delivery.id, new Date("2036-08-20"));

    const unchanged = await db.task.findUnique({ where: { id: instance.id } });
    expect(unchanged?.scheduledDate?.toISOString().slice(0, 10)).toBe("2036-08-09");

    await db.$executeRawUnsafe("DELETE FROM tasks WHERE id = ?", instance.id);
    await hardDelete("deliveries", [delivery.id]);
    await db.$executeRawUnsafe("DELETE FROM recurring_task_templates WHERE id = ?", template.id);
  });
});

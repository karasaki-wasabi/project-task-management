// RED: none of the affected Services emit business event logs yet (task
// 10.2, Requirement 10.2 — "納品作成、繰り返しタスクインスタンス生成、各
// エンティティの削除など" broad-impact operations must log operation type +
// target entity ID). This is a single cross-cutting test file (matching the
// cross-cutting nature of this Integration task, mirroring how task 10.1's
// wiring was tested inside delivery.service.test.ts) rather than scattering
// near-identical describe blocks across 6+ module test files.
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setBusinessEventLoggerForTests } from "./business-event-logger.js";
import { createLogger } from "./logger.js";
import { db } from "./db.js";
import { usersService } from "../modules/users/user.service.js";
import { tasksService } from "../modules/tasks/task.service.js";
import { deliveriesService } from "../modules/deliveries/delivery.service.js";
import { eventsService } from "../modules/events/event.service.js";
import { holidaysService } from "../modules/holidays/holiday.service.js";
import { recurrenceService } from "../modules/recurrence/recurrence.service.js";

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

beforeEach(() => {
  const collected = collectingStream();
  lines = collected.lines;
  setBusinessEventLoggerForTests(createLogger("debug", collected.stream));
});

afterAll(async () => {
  await db.$disconnect();
});

function findEvent(event: string): Record<string, unknown> | undefined {
  return lines.find((l) => l.event === event);
}

describe("business event logging (task 10.2)", () => {
  it("logs delivery.created with the requestId and the new delivery's id (Requirement 10.2)", async () => {
    const delivery = await deliveriesService.create({ name: `d-${randomUUID()}`, dueDate: new Date() }, "req-delivery-create");

    const logged = findEvent("delivery.created");
    expect(logged?.entityId).toBe(delivery.id);
    expect(logged?.requestId).toBe("req-delivery-create");

    await db.$executeRawUnsafe("DELETE FROM deliveries WHERE id = ?", delivery.id);
  });

  it("logs recurring_task_instance.generated for each instance generated via generateDueInstances", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "logging check",
      priority: "low",
      kind: "fixed_interval",
      intervalUnit: "day",
      intervalValue: 1,
      nonBusinessDayPolicy: "as_is",
    });
    await db.$executeRawUnsafe(
      "UPDATE recurring_task_templates SET created_at = ? WHERE id = ?",
      new Date("2037-01-01T00:00:00.000Z"),
      template.id,
    );

    const created = await recurrenceService.generateDueInstances(new Date("2037-01-01T00:00:00.000Z"), "req-generate");

    expect(created).toHaveLength(1);
    const logged = findEvent("recurring_task_instance.generated");
    expect(logged?.entityId).toBe(created[0].id);
    expect(logged?.requestId).toBe("req-generate");

    await db.$executeRawUnsafe("DELETE FROM tasks WHERE id = ?", created[0].id);
    await db.$executeRawUnsafe("DELETE FROM recurring_task_templates WHERE id = ?", template.id);
  });

  it("logs user.deleted with the deleted user's id", async () => {
    const user = await db.user.create({ data: { name: `u-${randomUUID()}` } });

    await usersService.delete(user.id, "req-user-delete");

    const logged = findEvent("user.deleted");
    expect(logged?.entityId).toBe(user.id);
    expect(logged?.requestId).toBe("req-user-delete");

    await db.$executeRawUnsafe("DELETE FROM users WHERE id = ?", user.id);
  });

  it("logs task.deleted with the deleted task's id", async () => {
    const created = await tasksService.create({ title: "loggable", priority: "low" });
    if (!created.ok) throw new Error("setup failed");

    await tasksService.delete(created.value.id, "req-task-delete");

    const logged = findEvent("task.deleted");
    expect(logged?.entityId).toBe(created.value.id);
    expect(logged?.requestId).toBe("req-task-delete");

    await db.$executeRawUnsafe("DELETE FROM tasks WHERE id = ?", created.value.id);
  });

  it("logs delivery.deleted with the deleted delivery's id", async () => {
    const delivery = await db.delivery.create({ data: { name: `d-${randomUUID()}`, dueDate: new Date() } });

    await deliveriesService.delete(delivery.id, "req-delivery-delete");

    const logged = findEvent("delivery.deleted");
    expect(logged?.entityId).toBe(delivery.id);
    expect(logged?.requestId).toBe("req-delivery-delete");

    await db.$executeRawUnsafe("DELETE FROM deliveries WHERE id = ?", delivery.id);
  });

  it("logs event.deleted with the deleted event's id", async () => {
    const event = await eventsService.create({ title: "loggable event", occursAt: new Date() });

    await eventsService.delete(event.id, "req-event-delete");

    const logged = findEvent("event.deleted");
    expect(logged?.entityId).toBe(event.id);
    expect(logged?.requestId).toBe("req-event-delete");

    await db.$executeRawUnsafe("DELETE FROM events WHERE id = ?", event.id);
  });

  it("logs recurring_task_template.deleted with the deleted template's id", async () => {
    const template = await recurrenceService.registerTemplate({
      title: "deletable logging check",
      priority: "low",
      kind: "fixed_interval",
      intervalUnit: "day",
      intervalValue: 1,
      nonBusinessDayPolicy: "as_is",
    });

    await recurrenceService.deleteTemplate(template.id, "req-template-delete");

    const logged = findEvent("recurring_task_template.deleted");
    expect(logged?.entityId).toBe(template.id);
    expect(logged?.requestId).toBe("req-template-delete");

    await db.$executeRawUnsafe("DELETE FROM recurring_task_templates WHERE id = ?", template.id);
  });

  it("logs non_business_day.deleted with the deleted record's id", async () => {
    const holiday = await holidaysService.register({ date: `2037-0${(Math.floor(Math.random() * 8) + 1)}-15` });

    await holidaysService.remove(holiday.id, "req-holiday-delete");

    const logged = findEvent("non_business_day.deleted");
    expect(logged?.entityId).toBe(holiday.id);
    expect(logged?.requestId).toBe("req-holiday-delete");

    await db.$executeRawUnsafe("DELETE FROM non_business_days WHERE id = ?", holiday.id);
  });
});

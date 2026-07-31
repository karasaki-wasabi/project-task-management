// RED: tasksService does not exist yet (task 3.1, Requirements 1.1-1.6, 7.2,
// 9.1-9.4). Integration test against real MySQL via shared/db.ts.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { tasksService } from "./task.service.js";

async function hardDeleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM tasks WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function hardDeleteUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function hardDeleteDeliveries(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM deliveries WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("tasksService (task 3.1)", () => {
  it("creates a task with status not_started by default (Requirement 1.1)", async () => {
    const result = await tasksService.create({ title: "write report", priority: "high" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("write report");
    expect(result.value.priority).toBe("high");
    expect(result.value.status).toBe("not_started");
    expect(result.value.deletedAt).toBeNull();

    await hardDeleteTasks([result.value.id]);
  });

  it("rejects creating a task with an empty title (Requirement 1.1)", async () => {
    const result = await tasksService.create({ title: "  ", priority: "low" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });
  });

  it("stores a free-form memo (Requirement 1.6)", async () => {
    const result = await tasksService.create({ title: "task with memo", priority: "medium", memo: "call the client" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.memo).toBe("call the client");

    await hardDeleteTasks([result.value.id]);
  });

  it("forces isRequiredForDelivery to false when no deliveryId is given (design.md TasksService Implementation Notes)", async () => {
    const result = await tasksService.create({ title: "no delivery", priority: "low", isRequiredForDelivery: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deliveryId).toBeNull();
    expect(result.value.isRequiredForDelivery).toBe(false);

    await hardDeleteTasks([result.value.id]);
  });

  it("updates status and stays visible when set to on_hold (Requirement 1.3, 1.4)", async () => {
    const created = await tasksService.create({ title: "pause me", priority: "medium" });
    if (!created.ok) throw new Error("setup failed");

    const updated = await tasksService.updateStatus(created.value.id, "on_hold");

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.status).toBe("on_hold");

    const list = await tasksService.list({});
    expect(list.some((t) => t.id === created.value.id)).toBe(true);

    await hardDeleteTasks([created.value.id]);
  });

  it("stamps completedAt when status becomes done, and clears it if moved away from done", async () => {
    const created = await tasksService.create({ title: "finish me", priority: "high" });
    if (!created.ok) throw new Error("setup failed");

    const done = await tasksService.updateStatus(created.value.id, "done");
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(done.value.completedAt).toBeInstanceOf(Date);
    }

    const reopened = await tasksService.updateStatus(created.value.id, "in_progress");
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.value.completedAt).toBeNull();
    }

    await hardDeleteTasks([created.value.id]);
  });

  it("returns not_found when updating status of a non-existent task", async () => {
    const result = await tasksService.updateStatus(randomUUID(), "done");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "not_found", taskId: expect.any(String) });
  });

  it("filters the list by deliveryId and assigneeUserId (Requirement 7.2)", async () => {
    const delivery = await db.delivery.create({ data: { name: `d-${randomUUID()}`, dueDate: new Date() } });
    const user = await db.user.create({ data: { name: `u-${randomUUID()}` } });

    const matching = await tasksService.create({
      title: "matches filter",
      priority: "low",
      deliveryId: delivery.id,
      assigneeUserId: user.id,
    });
    const nonMatching = await tasksService.create({ title: "does not match", priority: "low" });
    if (!matching.ok || !nonMatching.ok) throw new Error("setup failed");

    const byDelivery = await tasksService.list({ deliveryId: delivery.id });
    expect(byDelivery.map((t) => t.id)).toEqual([matching.value.id]);

    const byAssignee = await tasksService.list({ assigneeUserId: user.id });
    expect(byAssignee.map((t) => t.id)).toEqual([matching.value.id]);

    await hardDeleteTasks([matching.value.id, nonMatching.value.id]);
    await hardDeleteDeliveries([delivery.id]);
    await hardDeleteUsers([user.id]);
  });

  it("soft-deletes a task and excludes it from list (Requirement 9.3, 9.4)", async () => {
    const created = await tasksService.create({ title: "delete me", priority: "low" });
    if (!created.ok) throw new Error("setup failed");

    const deleteResult = await tasksService.delete(created.value.id);
    expect(deleteResult.ok).toBe(true);

    const list = await tasksService.list({});
    expect(list.some((t) => t.id === created.value.id)).toBe(false);

    const rawRow = await db.task.findFirst({ where: { id: created.value.id, deletedAt: { not: null } } });
    expect(rawRow).not.toBeNull();

    await hardDeleteTasks([created.value.id]);
  });

  it("returns not_found when deleting a non-existent task", async () => {
    const result = await tasksService.delete(randomUUID());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });
});

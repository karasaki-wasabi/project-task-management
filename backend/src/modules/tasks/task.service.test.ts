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

// RED: addChild/splitTask do not exist yet (task 3.2, Requirements 2.1-2.4).
describe("tasksService hierarchy (task 3.2)", () => {
  it("adds a child task under a parent (Requirement 2.1)", async () => {
    const parent = await tasksService.create({ title: "parent", priority: "medium" });
    if (!parent.ok) throw new Error("setup failed");

    const child = await tasksService.addChild(parent.value.id, { title: "child", priority: "low" });

    expect(child.ok).toBe(true);
    if (!child.ok) return;
    expect(child.value.parentTaskId).toBe(parent.value.id);

    await hardDeleteTasks([child.value.id, parent.value.id]);
  });

  it("allows a child to have its own child, i.e. multi-level nesting (Requirement 2.2)", async () => {
    const grandparent = await tasksService.create({ title: "grandparent", priority: "medium" });
    if (!grandparent.ok) throw new Error("setup failed");
    const parent = await tasksService.addChild(grandparent.value.id, { title: "parent", priority: "medium" });
    if (!parent.ok) throw new Error("setup failed");

    const child = await tasksService.addChild(parent.value.id, { title: "child", priority: "low" });

    expect(child.ok).toBe(true);
    if (!child.ok) return;
    expect(child.value.parentTaskId).toBe(parent.value.id);

    await hardDeleteTasks([child.value.id, parent.value.id, grandparent.value.id]);
  });

  it("returns not_found when adding a child to a non-existent parent", async () => {
    const result = await tasksService.addChild(randomUUID(), { title: "orphan", priority: "low" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("splits a task into parts that inherit its deliveryId and priority (Requirement 2.3)", async () => {
    const delivery = await db.delivery.create({ data: { name: `d-${randomUUID()}`, dueDate: new Date() } });
    const original = await tasksService.create({
      title: "big task",
      priority: "high",
      deliveryId: delivery.id,
    });
    if (!original.ok) throw new Error("setup failed");

    const result = await tasksService.splitTask(original.value.id, [
      { title: "part 1", priority: "low" },
      { title: "part 2", priority: "low" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    for (const part of result.value) {
      expect(part.parentTaskId).toBe(original.value.id);
      expect(part.deliveryId).toBe(delivery.id);
      expect(part.priority).toBe("high");
    }

    await hardDeleteTasks([...result.value.map((t) => t.id), original.value.id]);
    await db.$executeRawUnsafe("DELETE FROM deliveries WHERE id = ?", delivery.id);
  });

  it("rejects splitting into fewer than 2 parts", async () => {
    const original = await tasksService.create({ title: "small task", priority: "low" });
    if (!original.ok) throw new Error("setup failed");

    const result = await tasksService.splitTask(original.value.id, [{ title: "only one", priority: "low" }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("validation_error");

    await hardDeleteTasks([original.value.id]);
  });

  it("returns not_found when splitting a non-existent task", async () => {
    const result = await tasksService.splitTask(randomUUID(), [
      { title: "a", priority: "low" },
      { title: "b", priority: "low" },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("rejects completing a parent task while it has an incomplete child (Requirement 2.4)", async () => {
    const parent = await tasksService.create({ title: "parent with open child", priority: "medium" });
    if (!parent.ok) throw new Error("setup failed");
    const child = await tasksService.addChild(parent.value.id, { title: "unfinished child", priority: "low" });
    if (!child.ok) throw new Error("setup failed");

    const result = await tasksService.updateStatus(parent.value.id, "done");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "incomplete_children", taskId: parent.value.id });

    await hardDeleteTasks([child.value.id, parent.value.id]);
  });

  it("allows completing a parent task once all children are done", async () => {
    const parent = await tasksService.create({ title: "parent with finished child", priority: "medium" });
    if (!parent.ok) throw new Error("setup failed");
    const child = await tasksService.addChild(parent.value.id, { title: "finished child", priority: "low" });
    if (!child.ok) throw new Error("setup failed");
    const childDone = await tasksService.updateStatus(child.value.id, "done");
    if (!childDone.ok) throw new Error("setup failed");

    const result = await tasksService.updateStatus(parent.value.id, "done");

    expect(result.ok).toBe(true);

    await hardDeleteTasks([child.value.id, parent.value.id]);
  });

  it("still allows completion when children are deleted rather than done", async () => {
    const parent = await tasksService.create({ title: "parent with deleted child", priority: "medium" });
    if (!parent.ok) throw new Error("setup failed");
    const child = await tasksService.addChild(parent.value.id, { title: "removed child", priority: "low" });
    if (!child.ok) throw new Error("setup failed");
    const deleted = await tasksService.delete(child.value.id);
    if (!deleted.ok) throw new Error("setup failed");

    const result = await tasksService.updateStatus(parent.value.id, "done");

    expect(result.ok).toBe(true);

    await hardDeleteTasks([child.value.id, parent.value.id]);
  });
});

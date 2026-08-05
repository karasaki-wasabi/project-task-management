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

async function hardDeleteCases(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM cases WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function hardDeleteStages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM development_stages WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
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

  it("forces isRequiredForCase to false when no caseId is given (design.md TasksService Implementation Notes)", async () => {
    const result = await tasksService.create({ title: "no case", priority: "low", isRequiredForCase: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.caseId).toBeNull();
    expect(result.value.isRequiredForCase).toBe(false);

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

  it("gets a task by id (Requirement 1.2)", async () => {
    const created = await tasksService.create({ title: "detail me", priority: "medium" });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.getById(created.value.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(created.value.id);
    expect(result.value.title).toBe("detail me");

    await hardDeleteTasks([created.value.id]);
  });

  it("returns not_found when getting a non-existent task", async () => {
    const result = await tasksService.getById(randomUUID());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("updates title, priority, and memo (Requirement 1.1, 1.5, 1.6)", async () => {
    const created = await tasksService.create({ title: "original", priority: "low", memo: "old memo" });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, { title: "renamed", priority: "high", memo: "new memo" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("renamed");
    expect(result.value.priority).toBe("high");
    expect(result.value.memo).toBe("new memo");

    await hardDeleteTasks([created.value.id]);
  });

  it("rejects updating to an empty title", async () => {
    const created = await tasksService.create({ title: "keep me", priority: "low" });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, { title: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("validation_error");

    await hardDeleteTasks([created.value.id]);
  });

  it("updates assigneeUserId, overwriting an existing assignee (Requirement 7.2)", async () => {
    const originalAssignee = await db.user.create({ data: { name: `orig-${randomUUID()}` } });
    const newAssignee = await db.user.create({ data: { name: `new-${randomUUID()}` } });
    const created = await tasksService.create({
      title: "assign me",
      priority: "low",
      assigneeUserId: originalAssignee.id,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, { assigneeUserId: newAssignee.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assigneeUserId).toBe(newAssignee.id);

    await hardDeleteTasks([created.value.id]);
    await hardDeleteUsers([originalAssignee.id, newAssignee.id]);
  });

  it("forces isRequiredForCase to false when caseId is cleared", async () => {
    const caseRecord = await db.case.create({ data: { name: `c-${randomUUID()}`, endDate: new Date() } });
    const created = await tasksService.create({
      title: "linked",
      priority: "low",
      caseId: caseRecord.id,
      isRequiredForCase: true,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, { caseId: null });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.caseId).toBeNull();
    expect(result.value.isRequiredForCase).toBe(false);

    await hardDeleteTasks([created.value.id]);
    await hardDeleteCases([caseRecord.id]);
  });

  it("returns not_found when updating a non-existent task", async () => {
    const result = await tasksService.update(randomUUID(), { title: "ghost" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("filters the list by caseId and assigneeUserId (Requirement 7.2)", async () => {
    const caseRecord = await db.case.create({ data: { name: `c-${randomUUID()}`, endDate: new Date() } });
    const user = await db.user.create({ data: { name: `u-${randomUUID()}` } });

    const matching = await tasksService.create({
      title: "matches filter",
      priority: "low",
      caseId: caseRecord.id,
      assigneeUserId: user.id,
    });
    const nonMatching = await tasksService.create({ title: "does not match", priority: "low" });
    if (!matching.ok || !nonMatching.ok) throw new Error("setup failed");

    const byCase = await tasksService.list({ caseId: caseRecord.id });
    expect(byCase.map((t) => t.id)).toEqual([matching.value.id]);

    const byAssignee = await tasksService.list({ assigneeUserId: user.id });
    expect(byAssignee.map((t) => t.id)).toEqual([matching.value.id]);

    await hardDeleteTasks([matching.value.id, nonMatching.value.id]);
    await hardDeleteCases([caseRecord.id]);
    await hardDeleteUsers([user.id]);
  });

  // RED: unassignedCase does not exist on TaskListFilter yet (task 4,
  // design.md "Backend/tasks > TasksService.list 未割当フィルタ拡張",
  // Requirement 3.1).
  it("filters the list to only unassigned tasks when unassignedCase is true (Requirement 3.1)", async () => {
    const caseRecord = await db.case.create({ data: { name: `c-${randomUUID()}`, endDate: new Date() } });

    const unassigned = await tasksService.create({ title: "no case yet", priority: "low" });
    const assigned = await tasksService.create({
      title: "already has a case",
      priority: "low",
      caseId: caseRecord.id,
    });
    if (!unassigned.ok || !assigned.ok) throw new Error("setup failed");

    const byUnassignedCase = await tasksService.list({ unassignedCase: true });
    const ids = byUnassignedCase.map((t) => t.id);
    expect(ids).toContain(unassigned.value.id);
    expect(ids).not.toContain(assigned.value.id);

    await hardDeleteTasks([unassigned.value.id, assigned.value.id]);
    await hardDeleteCases([caseRecord.id]);
  });

  // Regression: unassignedCase absent (or any non-true value coming through
  // the route layer as undefined) must not change existing caseId-filter
  // behavior (task 4, design.md same section).
  it("keeps existing caseId-filter behavior unchanged when unassignedCase is not set (regression)", async () => {
    const caseRecord = await db.case.create({ data: { name: `c-${randomUUID()}`, endDate: new Date() } });

    const matching = await tasksService.create({
      title: "still matches caseId filter",
      priority: "low",
      caseId: caseRecord.id,
    });
    const nonMatching = await tasksService.create({ title: "still unassigned", priority: "low" });
    if (!matching.ok || !nonMatching.ok) throw new Error("setup failed");

    const byCase = await tasksService.list({ caseId: caseRecord.id });
    expect(byCase.map((t) => t.id)).toEqual([matching.value.id]);

    await hardDeleteTasks([matching.value.id, nonMatching.value.id]);
    await hardDeleteCases([caseRecord.id]);
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

  it("splits a task into parts that inherit its caseId and priority (Requirement 2.3)", async () => {
    const caseRecord = await db.case.create({ data: { name: `c-${randomUUID()}`, endDate: new Date() } });
    const original = await tasksService.create({
      title: "big task",
      priority: "high",
      caseId: caseRecord.id,
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
      expect(part.caseId).toBe(caseRecord.id);
      expect(part.priority).toBe("high");
    }

    await hardDeleteTasks([...result.value.map((t) => t.id), original.value.id]);
    await db.$executeRawUnsafe("DELETE FROM cases WHERE id = ?", caseRecord.id);
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

// RED: updateDevelopmentStage does not exist yet (task 15.1, Requirements
// 12.3, 12.6, 12.7, 12.8, 12.9).
describe("tasksService.updateDevelopmentStage (task 15.1)", () => {
  it("updates developmentStageId independently of the task's status (Requirement 12.9)", async () => {
    const created = await tasksService.create({ title: "stage task", priority: "low" });
    if (!created.ok) throw new Error("setup failed");
    const stage = await db.developmentStage.create({ data: { name: `stage-${randomUUID()}`, order: 0 } });

    const result = await tasksService.updateDevelopmentStage(created.value.id, stage.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.developmentStageId).toBe(stage.id);
    expect(result.value.status).toBe("not_started");

    await hardDeleteTasks([created.value.id]);
    await hardDeleteStages([stage.id]);
  });

  it("sets the assignee when the task is currently unassigned (Requirement 12.7)", async () => {
    const created = await tasksService.create({ title: "unassigned task", priority: "low" });
    if (!created.ok) throw new Error("setup failed");
    const user = await db.user.create({ data: { name: `assignee-${randomUUID()}` } });
    const stage = await db.developmentStage.create({ data: { name: `stage-${randomUUID()}`, order: 0 } });

    const result = await tasksService.updateDevelopmentStage(created.value.id, stage.id, user.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assigneeUserId).toBe(user.id);

    await hardDeleteTasks([created.value.id]);
    await hardDeleteUsers([user.id]);
    await hardDeleteStages([stage.id]);
  });

  it("does not overwrite the assignee when the task already has one (Requirement 12.8)", async () => {
    const originalAssignee = await db.user.create({ data: { name: `original-${randomUUID()}` } });
    const otherUser = await db.user.create({ data: { name: `other-${randomUUID()}` } });
    const created = await tasksService.create({
      title: "already assigned task",
      priority: "low",
      assigneeUserId: originalAssignee.id,
    });
    if (!created.ok) throw new Error("setup failed");
    const stage = await db.developmentStage.create({ data: { name: `stage-${randomUUID()}`, order: 0 } });

    const result = await tasksService.updateDevelopmentStage(created.value.id, stage.id, otherUser.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assigneeUserId).toBe(originalAssignee.id);
    expect(result.value.developmentStageId).toBe(stage.id);

    await hardDeleteTasks([created.value.id]);
    await hardDeleteUsers([originalAssignee.id, otherUser.id]);
    await hardDeleteStages([stage.id]);
  });

  it("returns not_found (404) for a non-existent task", async () => {
    const result = await tasksService.updateDevelopmentStage(randomUUID(), randomUUID());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ type: "not_found" });
  });
});

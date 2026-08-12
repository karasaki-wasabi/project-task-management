// tasksService workspace scope (workspace-resource-scope task 3.1;
// Requirements 1.1, 1.2, 3.1, 3.2, 3.3) plus prior TasksService coverage.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import { tasksService } from "./task.service.js";

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

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

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function addWorkspaceMember(workspaceId: string, userId: string): Promise<string> {
  const row = await db.workspaceMember.create({ data: { workspaceId, userId } });
  return row.id;
}

async function hardDeleteMembers(ids: string[]): Promise<void> {
  await hardDelete("workspace_members", ids);
}

let workspaceA: VerifiedWorkspaceId;
let workspaceB: VerifiedWorkspaceId;
let ownerUserId: string;

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("task-svc-ws") });
  ownerUserId = user.id;
  const [a, b] = await Promise.all([
    db.workspace.create({ data: { name: `task-svc-a-${randomUUID()}`, createdByUserId: ownerUserId } }),
    db.workspace.create({ data: { name: `task-svc-b-${randomUUID()}`, createdByUserId: ownerUserId } }),
  ]);
  workspaceA = asVerified(a.id);
  workspaceB = asVerified(b.id);
});

afterAll(async () => {
  // Leftover stages from failed cases still reference the workspace.
  await db.$executeRawUnsafe(
    `DELETE FROM development_stages WHERE workspace_id IN (?, ?)`,
    workspaceA,
    workspaceB,
  );
  await db.$executeRawUnsafe(`DELETE FROM tasks WHERE workspace_id IN (?, ?)`, workspaceA, workspaceB);
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDeleteUsers([ownerUserId]);
  await db.$disconnect();
});

describe("tasksService (task 3.1 + workspace-resource-scope 3.1)", () => {
  it("creates a task with status not_started in the given workspace (Requirement 1.1)", async () => {
    const result = await tasksService.create({
      title: "write report",
      priority: "high",
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("write report");
    expect(result.value.priority).toBe("high");
    expect(result.value.status).toBe("not_started");
    expect(result.value.workspaceId).toBe(workspaceA);
    expect(result.value.deletedAt).toBeNull();

    await hardDeleteTasks([result.value.id]);
  });

  it("rejects creating a task with an empty title (Requirement 1.1)", async () => {
    const result = await tasksService.create({ title: "  ", priority: "low", workspaceId: workspaceA });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });
  });

  it("stores a free-form memo (Requirement 1.6)", async () => {
    const result = await tasksService.create({
      title: "task with memo",
      priority: "medium",
      memo: "call the client",
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.memo).toBe("call the client");

    await hardDeleteTasks([result.value.id]);
  });

  it("forces isRequiredForCase to false when no caseId is given (design.md TasksService Implementation Notes)", async () => {
    const result = await tasksService.create({
      title: "no case",
      priority: "low",
      isRequiredForCase: true,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.caseId).toBeNull();
    expect(result.value.isRequiredForCase).toBe(false);

    await hardDeleteTasks([result.value.id]);
  });

  it("updates status and stays visible when set to on_hold (Requirement 1.3, 1.4)", async () => {
    const created = await tasksService.create({ title: "pause me", priority: "medium", workspaceId: workspaceA });
    if (!created.ok) throw new Error("setup failed");

    const updated = await tasksService.updateStatus(created.value.id, workspaceA, "on_hold");

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.status).toBe("on_hold");

    const list = await tasksService.list({ workspaceId: workspaceA });
    expect(list.some((t) => t.id === created.value.id)).toBe(true);

    await hardDeleteTasks([created.value.id]);
  });

  // task-status-model 3.2: updateStatus is stage-internal work state only (2.4).
  it("does not change completedAt when status changes (2.4)", async () => {
    const created = await tasksService.create({ title: "finish me", priority: "high", workspaceId: workspaceA });
    if (!created.ok) throw new Error("setup failed");
    expect(created.value.completedAt).toBeNull();

    const handoff = await tasksService.updateStatus(created.value.id, workspaceA, "ready_for_handoff");
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    expect(handoff.value.status).toBe("ready_for_handoff");
    expect(handoff.value.completedAt).toBeNull();

    const reopened = await tasksService.updateStatus(created.value.id, workspaceA, "in_progress");
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value.status).toBe("in_progress");
    expect(reopened.value.completedAt).toBeNull();

    await hardDeleteTasks([created.value.id]);
  });

  it("rejects status changes when the task is on a terminal stage (4.5)", async () => {
    const created = await tasksService.create({
      title: "terminal status",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const completedStage = await db.developmentStage.create({
      data: {
        name: `completed-status-${randomUUID()}`,
        order: 940,
        kind: "completed",
        workspaceId: workspaceA,
      },
    });
    const cancelledStage = await db.developmentStage.create({
      data: {
        name: `cancelled-status-${randomUUID()}`,
        order: 941,
        kind: "cancelled",
        workspaceId: workspaceA,
      },
    });

    const onCompleted = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      completedStage.id,
    );
    if (!onCompleted.ok) throw new Error("setup failed");

    const fromCompleted = await tasksService.updateStatus(created.value.id, workspaceA, "in_progress");
    expect(fromCompleted.ok).toBe(false);
    if (fromCompleted.ok) return;
    expect(fromCompleted.error).toEqual({ type: "status_not_applicable", taskId: created.value.id });
    expect(onCompleted.value.completedAt).toBeInstanceOf(Date);
    const stillCompleted = await tasksService.getById(created.value.id, workspaceA);
    expect(stillCompleted.ok).toBe(true);
    if (stillCompleted.ok) {
      expect(stillCompleted.value.completedAt).toEqual(onCompleted.value.completedAt);
      expect(stillCompleted.value.status).toBe("not_started");
    }

    const onCancelled = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      cancelledStage.id,
    );
    if (!onCancelled.ok) throw new Error("setup failed");

    const fromCancelled = await tasksService.updateStatus(created.value.id, workspaceA, "on_hold");
    expect(fromCancelled.ok).toBe(false);
    if (fromCancelled.ok) return;
    expect(fromCancelled.error).toEqual({ type: "status_not_applicable", taskId: created.value.id });

    await hardDeleteTasks([created.value.id]);
    await hardDeleteStages([completedStage.id, cancelledStage.id]);
  });

  it("returns not_found when updating status of a non-existent task", async () => {
    const result = await tasksService.updateStatus(randomUUID(), workspaceA, "ready_for_handoff");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "not_found", taskId: expect.any(String) });
  });

  it("gets a task by id within the same workspace (Requirement 1.2, 3.2)", async () => {
    const created = await tasksService.create({ title: "detail me", priority: "medium", workspaceId: workspaceA });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.getById(created.value.id, workspaceA);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(created.value.id);
    expect(result.value.title).toBe("detail me");

    await hardDeleteTasks([created.value.id]);
  });

  it("returns not_found when getting a non-existent task", async () => {
    const result = await tasksService.getById(randomUUID(), workspaceA);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("returns not_found when getting a task in another workspace (Requirement 3.3)", async () => {
    const created = await tasksService.create({
      title: "other ws detail",
      priority: "low",
      workspaceId: workspaceB,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.getById(created.value.id, workspaceA);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");

    await hardDeleteTasks([created.value.id]);
  });

  it("updates title, priority, and memo (Requirement 1.1, 1.5, 1.6)", async () => {
    const created = await tasksService.create({
      title: "original",
      priority: "low",
      memo: "old memo",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, workspaceA, {
      title: "renamed",
      priority: "high",
      memo: "new memo",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("renamed");
    expect(result.value.priority).toBe("high");
    expect(result.value.memo).toBe("new memo");

    await hardDeleteTasks([created.value.id]);
  });

  it("rejects updating to an empty title", async () => {
    const created = await tasksService.create({ title: "keep me", priority: "low", workspaceId: workspaceA });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, workspaceA, { title: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("validation_error");

    await hardDeleteTasks([created.value.id]);
  });

  it("updates assigneeUserId, overwriting an existing assignee (Requirement 7.2)", async () => {
    const originalAssignee = await db.user.create({ data: createUserData(`orig-${randomUUID()}`) });
    const newAssignee = await db.user.create({ data: createUserData(`new-${randomUUID()}`) });
    const membershipIds = await Promise.all([
      addWorkspaceMember(workspaceA, originalAssignee.id),
      addWorkspaceMember(workspaceA, newAssignee.id),
    ]);
    const created = await tasksService.create({
      title: "assign me",
      priority: "low",
      assigneeUserId: originalAssignee.id,
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, workspaceA, { assigneeUserId: newAssignee.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assigneeUserId).toBe(newAssignee.id);

    await hardDeleteTasks([created.value.id]);
    await hardDeleteMembers(membershipIds);
    await hardDeleteUsers([originalAssignee.id, newAssignee.id]);
  });

  it("forces isRequiredForCase to false when caseId is cleared", async () => {
    const caseRecord = await db.case.create({
      data: { name: `c-${randomUUID()}`, endDate: new Date(), workspaceId: workspaceA },
    });
    const created = await tasksService.create({
      title: "linked",
      priority: "low",
      caseId: caseRecord.id,
      isRequiredForCase: true,
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, workspaceA, { caseId: null });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.caseId).toBeNull();
    expect(result.value.isRequiredForCase).toBe(false);

    await hardDeleteTasks([created.value.id]);
    await hardDeleteCases([caseRecord.id]);
  });

  it("returns not_found when updating a non-existent task", async () => {
    const result = await tasksService.update(randomUUID(), workspaceA, { title: "ghost" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("returns not_found when updating a task in another workspace (Requirement 3.3)", async () => {
    const created = await tasksService.create({
      title: "other ws update",
      priority: "low",
      workspaceId: workspaceB,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, workspaceA, { title: "hijack" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");

    await hardDeleteTasks([created.value.id]);
  });

  it("filters the list by caseId and assigneeUserId within workspace (Requirement 7.2)", async () => {
    const caseRecord = await db.case.create({
      data: { name: `c-${randomUUID()}`, endDate: new Date(), workspaceId: workspaceA },
    });
    const user = await db.user.create({ data: createUserData(`u-${randomUUID()}`) });
    const membershipId = await addWorkspaceMember(workspaceA, user.id);

    const matching = await tasksService.create({
      title: "matches filter",
      priority: "low",
      caseId: caseRecord.id,
      assigneeUserId: user.id,
      workspaceId: workspaceA,
    });
    const nonMatching = await tasksService.create({
      title: "does not match",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!matching.ok || !nonMatching.ok) throw new Error("setup failed");

    const byCase = await tasksService.list({ caseId: caseRecord.id, workspaceId: workspaceA });
    expect(byCase.map((t) => t.id)).toEqual([matching.value.id]);

    const byAssignee = await tasksService.list({ assigneeUserId: user.id, workspaceId: workspaceA });
    expect(byAssignee.map((t) => t.id)).toEqual([matching.value.id]);

    await hardDeleteTasks([matching.value.id, nonMatching.value.id]);
    await hardDeleteCases([caseRecord.id]);
    await hardDeleteMembers([membershipId]);
    await hardDeleteUsers([user.id]);
  });

  it("lists only tasks in the requested workspace (Requirement 3.1)", async () => {
    const inA = await tasksService.create({ title: "list-a", priority: "low", workspaceId: workspaceA });
    const inB = await tasksService.create({ title: "list-b", priority: "low", workspaceId: workspaceB });
    if (!inA.ok || !inB.ok) throw new Error("setup failed");

    const listA = await tasksService.list({ workspaceId: workspaceA });
    expect(listA.map((t) => t.id)).toContain(inA.value.id);
    expect(listA.map((t) => t.id)).not.toContain(inB.value.id);

    await hardDeleteTasks([inA.value.id, inB.value.id]);
  });

  it("filters the list to only unassigned tasks when unassignedCase is true (Requirement 3.1)", async () => {
    const caseRecord = await db.case.create({
      data: { name: `c-${randomUUID()}`, endDate: new Date(), workspaceId: workspaceA },
    });

    const unassigned = await tasksService.create({
      title: "no case yet",
      priority: "low",
      workspaceId: workspaceA,
    });
    const assigned = await tasksService.create({
      title: "already has a case",
      priority: "low",
      caseId: caseRecord.id,
      workspaceId: workspaceA,
    });
    if (!unassigned.ok || !assigned.ok) throw new Error("setup failed");

    const byUnassignedCase = await tasksService.list({ unassignedCase: true, workspaceId: workspaceA });
    const ids = byUnassignedCase.map((t) => t.id);
    expect(ids).toContain(unassigned.value.id);
    expect(ids).not.toContain(assigned.value.id);

    await hardDeleteTasks([unassigned.value.id, assigned.value.id]);
    await hardDeleteCases([caseRecord.id]);
  });

  it("keeps existing caseId-filter behavior unchanged when unassignedCase is not set (regression)", async () => {
    const caseRecord = await db.case.create({
      data: { name: `c-${randomUUID()}`, endDate: new Date(), workspaceId: workspaceA },
    });

    const matching = await tasksService.create({
      title: "still matches caseId filter",
      priority: "low",
      caseId: caseRecord.id,
      workspaceId: workspaceA,
    });
    const nonMatching = await tasksService.create({
      title: "still unassigned",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!matching.ok || !nonMatching.ok) throw new Error("setup failed");

    const byCase = await tasksService.list({ caseId: caseRecord.id, workspaceId: workspaceA });
    expect(byCase.map((t) => t.id)).toEqual([matching.value.id]);

    await hardDeleteTasks([matching.value.id, nonMatching.value.id]);
    await hardDeleteCases([caseRecord.id]);
  });

  it("soft-deletes a task and excludes it from list (Requirement 9.3, 9.4)", async () => {
    const created = await tasksService.create({ title: "delete me", priority: "low", workspaceId: workspaceA });
    if (!created.ok) throw new Error("setup failed");

    const deleteResult = await tasksService.delete(created.value.id, workspaceA);
    expect(deleteResult.ok).toBe(true);

    const list = await tasksService.list({ workspaceId: workspaceA });
    expect(list.some((t) => t.id === created.value.id)).toBe(false);

    const rawRow = await db.task.findFirst({ where: { id: created.value.id, deletedAt: { not: null } } });
    expect(rawRow).not.toBeNull();

    await hardDeleteTasks([created.value.id]);
  });

  it("returns not_found when deleting a non-existent task", async () => {
    const result = await tasksService.delete(randomUUID(), workspaceA);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("returns not_found when deleting a task in another workspace (Requirement 3.3)", async () => {
    const created = await tasksService.create({
      title: "other ws delete",
      priority: "low",
      workspaceId: workspaceB,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.delete(created.value.id, workspaceA);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");

    await hardDeleteTasks([created.value.id]);
  });
});

describe("tasksService hierarchy (task 3.2)", () => {
  it("adds a child task under a parent (Requirement 2.1)", async () => {
    const parent = await tasksService.create({ title: "parent", priority: "medium", workspaceId: workspaceA });
    if (!parent.ok) throw new Error("setup failed");

    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "child",
      priority: "low",
      workspaceId: workspaceA,
    });

    expect(child.ok).toBe(true);
    if (!child.ok) return;
    expect(child.value.parentTaskId).toBe(parent.value.id);
    expect(child.value.workspaceId).toBe(workspaceA);

    await hardDeleteTasks([child.value.id, parent.value.id]);
  });

  it("allows a child to have its own child, i.e. multi-level nesting (Requirement 2.2)", async () => {
    const grandparent = await tasksService.create({
      title: "grandparent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!grandparent.ok) throw new Error("setup failed");
    const parent = await tasksService.addChild(grandparent.value.id, workspaceA, {
      title: "parent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");

    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "child",
      priority: "low",
      workspaceId: workspaceA,
    });

    expect(child.ok).toBe(true);
    if (!child.ok) return;
    expect(child.value.parentTaskId).toBe(parent.value.id);

    await hardDeleteTasks([child.value.id, parent.value.id, grandparent.value.id]);
  });

  it("returns not_found when adding a child to a non-existent parent", async () => {
    const result = await tasksService.addChild(randomUUID(), workspaceA, {
      title: "orphan",
      priority: "low",
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("splits a task into parts that inherit its caseId and priority (Requirement 2.3)", async () => {
    const caseRecord = await db.case.create({
      data: { name: `c-${randomUUID()}`, endDate: new Date(), workspaceId: workspaceA },
    });
    const original = await tasksService.create({
      title: "big task",
      priority: "high",
      caseId: caseRecord.id,
      workspaceId: workspaceA,
    });
    if (!original.ok) throw new Error("setup failed");

    const result = await tasksService.splitTask(original.value.id, workspaceA, [
      { title: "part 1", priority: "low", workspaceId: workspaceA },
      { title: "part 2", priority: "low", workspaceId: workspaceA },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    for (const part of result.value) {
      expect(part.parentTaskId).toBe(original.value.id);
      expect(part.caseId).toBe(caseRecord.id);
      expect(part.priority).toBe("high");
      expect(part.workspaceId).toBe(workspaceA);
    }

    await hardDeleteTasks([...result.value.map((t) => t.id), original.value.id]);
    await hardDeleteCases([caseRecord.id]);
  });

  it("rejects splitting into fewer than 2 parts", async () => {
    const original = await tasksService.create({ title: "small task", priority: "low", workspaceId: workspaceA });
    if (!original.ok) throw new Error("setup failed");

    const result = await tasksService.splitTask(original.value.id, workspaceA, [
      { title: "only one", priority: "low", workspaceId: workspaceA },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("validation_error");

    await hardDeleteTasks([original.value.id]);
  });

  it("returns not_found when splitting a non-existent task", async () => {
    const result = await tasksService.splitTask(randomUUID(), workspaceA, [
      { title: "a", priority: "low", workspaceId: workspaceA },
      { title: "b", priority: "low", workspaceId: workspaceA },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  // task-status-model 3.2: parent/child constraints no longer run on updateStatus (4.2, 5.4).
  it("allows ready_for_handoff on a parent with open children without stamping completedAt (2.4, 4.2)", async () => {
    const parent = await tasksService.create({
      title: "parent with open child",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "unfinished child",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!child.ok) throw new Error("setup failed");

    const result = await tasksService.updateStatus(parent.value.id, workspaceA, "ready_for_handoff");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("ready_for_handoff");
    expect(result.value.completedAt).toBeNull();

    await hardDeleteTasks([child.value.id, parent.value.id]);
  });
});

describe("tasksService.updateDevelopmentStage (task 15.1)", () => {
  it("updates developmentStageId independently of the task's status (Requirement 12.9)", async () => {
    const created = await tasksService.create({ title: "stage task", priority: "low", workspaceId: workspaceA });
    if (!created.ok) throw new Error("setup failed");
    const stage = await db.developmentStage.create({
      data: { name: `stage-${randomUUID()}`, order: 0, workspaceId: workspaceA },
    });

    const result = await tasksService.updateDevelopmentStage(created.value.id, workspaceA, stage.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.developmentStageId).toBe(stage.id);
    expect(result.value.status).toBe("not_started");

    await hardDeleteTasks([created.value.id]);
    await hardDeleteStages([stage.id]);
  });

  it("sets the assignee when the task is currently unassigned (Requirement 12.7)", async () => {
    const created = await tasksService.create({
      title: "unassigned task",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const user = await db.user.create({ data: createUserData(`assignee-${randomUUID()}`) });
    const membershipId = await addWorkspaceMember(workspaceA, user.id);
    const stage = await db.developmentStage.create({
      data: { name: `stage-${randomUUID()}`, order: 0, workspaceId: workspaceA },
    });

    const result = await tasksService.updateDevelopmentStage(created.value.id, workspaceA, stage.id, user.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assigneeUserId).toBe(user.id);

    await hardDeleteTasks([created.value.id]);
    await hardDeleteMembers([membershipId]);
    await hardDeleteUsers([user.id]);
    await hardDeleteStages([stage.id]);
  });

  it("does not overwrite the assignee when the task already has one (Requirement 12.8)", async () => {
    const originalAssignee = await db.user.create({ data: createUserData(`original-${randomUUID()}`) });
    const otherUser = await db.user.create({ data: createUserData(`other-${randomUUID()}`) });
    const membershipId = await addWorkspaceMember(workspaceA, originalAssignee.id);
    const created = await tasksService.create({
      title: "already assigned task",
      priority: "low",
      assigneeUserId: originalAssignee.id,
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const stage = await db.developmentStage.create({
      data: { name: `stage-${randomUUID()}`, order: 0, workspaceId: workspaceA },
    });

    const result = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      stage.id,
      otherUser.id,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assigneeUserId).toBe(originalAssignee.id);
    expect(result.value.developmentStageId).toBe(stage.id);

    await hardDeleteTasks([created.value.id]);
    await hardDeleteMembers([membershipId]);
    await hardDeleteUsers([originalAssignee.id, otherUser.id]);
    await hardDeleteStages([stage.id]);
  });

  it("returns not_found (404) for a non-existent task", async () => {
    const result = await tasksService.updateDevelopmentStage(randomUUID(), workspaceA, randomUUID());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ type: "not_found" });
  });
});

describe("tasksService.updateDevelopmentStage (task-status-model 3.1)", () => {
  async function createStage(
    kind: "normal" | "completed" | "cancelled",
    order: number,
  ) {
    return db.developmentStage.create({
      data: {
        name: `${kind}-${randomUUID()}`,
        order,
        kind,
        workspaceId: workspaceA,
      },
    });
  }

  it("stamps completedAt on move to completed, clears on normal, restamps on completed again (2.1, 2.2)", async () => {
    const created = await tasksService.create({
      title: "stamp cycle",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const completed = await createStage("completed", 910);
    const normal = await createStage("normal", 100);

    const toCompleted = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      completed.id,
    );
    expect(toCompleted.ok).toBe(true);
    if (!toCompleted.ok) return;
    expect(toCompleted.value.completedAt).toBeInstanceOf(Date);
    const firstStamp = toCompleted.value.completedAt!.getTime();

    await new Promise((r) => setTimeout(r, 5));

    const toNormal = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      normal.id,
    );
    expect(toNormal.ok).toBe(true);
    if (!toNormal.ok) return;
    expect(toNormal.value.completedAt).toBeNull();

    await new Promise((r) => setTimeout(r, 5));

    const again = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      completed.id,
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.completedAt).toBeInstanceOf(Date);
    expect(again.value.completedAt!.getTime()).toBeGreaterThan(firstStamp);

    await hardDeleteTasks([created.value.id]);
    await hardDeleteStages([completed.id, normal.id]);
  });

  it("does not stamp completedAt when moved to cancelled (2.3)", async () => {
    const created = await tasksService.create({
      title: "cancel me",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const cancelled = await createStage("cancelled", 920);

    const result = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      cancelled.id,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.developmentStageId).toBe(cancelled.id);
    expect(result.value.completedAt).toBeNull();

    await hardDeleteTasks([created.value.id]);
    await hardDeleteStages([cancelled.id]);
  });

  it("clears completedAt when moved from completed to null stage (2.2, 2.5)", async () => {
    const created = await tasksService.create({
      title: "clear via null",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const completed = await createStage("completed", 911);
    const stamped = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      completed.id,
    );
    expect(stamped.ok).toBe(true);
    if (!stamped.ok) return;
    expect(stamped.value.completedAt).toBeInstanceOf(Date);

    const cleared = await tasksService.updateDevelopmentStage(created.value.id, workspaceA, null);

    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.value.developmentStageId).toBeNull();
    expect(cleared.value.completedAt).toBeNull();

    await hardDeleteTasks([created.value.id]);
    await hardDeleteStages([completed.id]);
  });

  it("resets status to not_started only when the stage actually changes (4.4)", async () => {
    const created = await tasksService.create({
      title: "status reset",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const stageA = await createStage("normal", 101);
    const stageB = await createStage("normal", 102);

    const placed = await tasksService.updateDevelopmentStage(created.value.id, workspaceA, stageA.id);
    if (!placed.ok) throw new Error("setup failed");
    const inProgress = await tasksService.updateStatus(created.value.id, workspaceA, "in_progress");
    if (!inProgress.ok) throw new Error("setup failed");

    const sameStage = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      stageA.id,
    );
    expect(sameStage.ok).toBe(true);
    if (!sameStage.ok) return;
    expect(sameStage.value.status).toBe("in_progress");

    const moved = await tasksService.updateDevelopmentStage(created.value.id, workspaceA, stageB.id);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.status).toBe("not_started");

    await hardDeleteTasks([created.value.id]);
    await hardDeleteStages([stageA.id, stageB.id]);
  });

  it("rejects move to completed when an open child exists (5.1, 5.4)", async () => {
    const parent = await tasksService.create({
      title: "parent open child",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "open child",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!child.ok) throw new Error("setup failed");
    const completed = await createStage("completed", 912);

    const result = await tasksService.updateDevelopmentStage(
      parent.value.id,
      workspaceA,
      completed.id,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "incomplete_children", taskId: parent.value.id });

    await hardDeleteTasks([child.value.id, parent.value.id]);
    await hardDeleteStages([completed.id]);
  });

  it("allows move to completed when the only open child is cancelled (5.2)", async () => {
    const parent = await tasksService.create({
      title: "parent cancelled child",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "cancelled child",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!child.ok) throw new Error("setup failed");
    const cancelled = await createStage("cancelled", 921);
    const completed = await createStage("completed", 913);
    const childCancelled = await tasksService.updateDevelopmentStage(
      child.value.id,
      workspaceA,
      cancelled.id,
    );
    if (!childCancelled.ok) throw new Error("setup failed");

    const result = await tasksService.updateDevelopmentStage(
      parent.value.id,
      workspaceA,
      completed.id,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.completedAt).toBeInstanceOf(Date);

    await hardDeleteTasks([child.value.id, parent.value.id]);
    await hardDeleteStages([cancelled.id, completed.id]);
  });

  it("allows move to cancelled regardless of open children (5.3)", async () => {
    const parent = await tasksService.create({
      title: "cancel parent with open child",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "still open",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!child.ok) throw new Error("setup failed");
    const cancelled = await createStage("cancelled", 922);

    const result = await tasksService.updateDevelopmentStage(
      parent.value.id,
      workspaceA,
      cancelled.id,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.developmentStageId).toBe(cancelled.id);
    expect(result.value.completedAt).toBeNull();

    await hardDeleteTasks([child.value.id, parent.value.id]);
    await hardDeleteStages([cancelled.id]);
  });

  it("allows a stage-unset task to move directly to a terminal stage (2.5)", async () => {
    const created = await tasksService.create({
      title: "unset to terminal",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    expect(created.value.developmentStageId).toBeNull();
    const completed = await createStage("completed", 914);
    const cancelled = await createStage("cancelled", 923);

    const toCompleted = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      completed.id,
    );
    expect(toCompleted.ok).toBe(true);
    if (!toCompleted.ok) return;
    expect(toCompleted.value.completedAt).toBeInstanceOf(Date);

    const unset = await tasksService.updateDevelopmentStage(created.value.id, workspaceA, null);
    if (!unset.ok) throw new Error("setup failed");

    const toCancelled = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      cancelled.id,
    );
    expect(toCancelled.ok).toBe(true);
    if (!toCancelled.ok) return;
    expect(toCancelled.value.completedAt).toBeNull();

    await hardDeleteTasks([created.value.id]);
    await hardDeleteStages([completed.id, cancelled.id]);
  });
});

describe("tasksService closed parent child invariant (task-status-model 3.3, Requirements 5.5, 5.6)", () => {
  async function createStage(
    kind: "normal" | "completed" | "cancelled",
    order: number,
  ) {
    return db.developmentStage.create({
      data: {
        name: `${kind}-${randomUUID()}`,
        order,
        kind,
        workspaceId: workspaceA,
      },
    });
  }

  it("rejects splitTask when the task is on a completed stage (5.5)", async () => {
    const original = await tasksService.create({
      title: "closed split parent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!original.ok) throw new Error("setup failed");
    const completed = await createStage("completed", 930);
    const closed = await tasksService.updateDevelopmentStage(
      original.value.id,
      workspaceA,
      completed.id,
    );
    if (!closed.ok) throw new Error("setup failed");

    const result = await tasksService.splitTask(original.value.id, workspaceA, [
      { title: "part 1", priority: "low", workspaceId: workspaceA },
      { title: "part 2", priority: "low", workspaceId: workspaceA },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      type: "closed_task_cannot_take_children",
      taskId: original.value.id,
    });

    await hardDeleteTasks([original.value.id]);
    await hardDeleteStages([completed.id]);
  });

  it("rejects splitTask when the task is on a cancelled stage (5.5)", async () => {
    const original = await tasksService.create({
      title: "cancelled split parent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!original.ok) throw new Error("setup failed");
    const cancelled = await createStage("cancelled", 931);
    const closed = await tasksService.updateDevelopmentStage(
      original.value.id,
      workspaceA,
      cancelled.id,
    );
    if (!closed.ok) throw new Error("setup failed");

    const result = await tasksService.splitTask(original.value.id, workspaceA, [
      { title: "part 1", priority: "low", workspaceId: workspaceA },
      { title: "part 2", priority: "low", workspaceId: workspaceA },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      type: "closed_task_cannot_take_children",
      taskId: original.value.id,
    });

    await hardDeleteTasks([original.value.id]);
    await hardDeleteStages([cancelled.id]);
  });

  it("rejects create when parentTaskId is a completed-stage task (5.6)", async () => {
    const parent = await tasksService.create({
      title: "completed parent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const completed = await createStage("completed", 932);
    const closed = await tasksService.updateDevelopmentStage(
      parent.value.id,
      workspaceA,
      completed.id,
    );
    if (!closed.ok) throw new Error("setup failed");

    const result = await tasksService.create({
      title: "open child under closed",
      priority: "low",
      parentTaskId: parent.value.id,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      type: "closed_task_cannot_take_children",
      taskId: parent.value.id,
    });

    await hardDeleteTasks([parent.value.id]);
    await hardDeleteStages([completed.id]);
  });

  it("rejects addChild when the parent is on a completed stage (5.6)", async () => {
    const parent = await tasksService.create({
      title: "completed addChild parent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const completed = await createStage("completed", 933);
    const closed = await tasksService.updateDevelopmentStage(
      parent.value.id,
      workspaceA,
      completed.id,
    );
    if (!closed.ok) throw new Error("setup failed");

    const result = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "child of closed",
      priority: "low",
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      type: "closed_task_cannot_take_children",
      taskId: parent.value.id,
    });

    await hardDeleteTasks([parent.value.id]);
    await hardDeleteStages([completed.id]);
  });

  it("rejects create when parentTaskId is a cancelled-stage task (5.6)", async () => {
    const parent = await tasksService.create({
      title: "cancelled parent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const cancelled = await createStage("cancelled", 934);
    const closed = await tasksService.updateDevelopmentStage(
      parent.value.id,
      workspaceA,
      cancelled.id,
    );
    if (!closed.ok) throw new Error("setup failed");

    const result = await tasksService.create({
      title: "open child under cancelled",
      priority: "low",
      parentTaskId: parent.value.id,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      type: "closed_task_cannot_take_children",
      taskId: parent.value.id,
    });

    await hardDeleteTasks([parent.value.id]);
    await hardDeleteStages([cancelled.id]);
  });
});

describe("tasksService assignee membership (workspace-resource-scope task 3.2, Requirement 4.2)", () => {
  it("rejects create when assigneeUserId is not a workspace member", async () => {
    const outsider = await db.user.create({ data: createUserData(`outsider-create-${randomUUID()}`) });

    const result = await tasksService.create({
      title: "non-member assignee",
      priority: "low",
      assigneeUserId: outsider.id,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });

    await hardDeleteUsers([outsider.id]);
  });

  it("rejects update when assigneeUserId is not a workspace member", async () => {
    const created = await tasksService.create({
      title: "update assignee later",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const outsider = await db.user.create({ data: createUserData(`outsider-update-${randomUUID()}`) });

    const result = await tasksService.update(created.value.id, workspaceA, {
      assigneeUserId: outsider.id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });

    await hardDeleteTasks([created.value.id]);
    await hardDeleteUsers([outsider.id]);
  });

  it("rejects updateDevelopmentStage assignee when user is not a workspace member", async () => {
    const created = await tasksService.create({
      title: "stage assign outsider",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const outsider = await db.user.create({ data: createUserData(`outsider-stage-${randomUUID()}`) });
    const stage = await db.developmentStage.create({
      data: { name: `stage-${randomUUID()}`, order: 0, workspaceId: workspaceA },
    });

    const result = await tasksService.updateDevelopmentStage(
      created.value.id,
      workspaceA,
      stage.id,
      outsider.id,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });

    await hardDeleteTasks([created.value.id]);
    await hardDeleteUsers([outsider.id]);
    await hardDeleteStages([stage.id]);
  });

  it("accepts create when assigneeUserId is a workspace member", async () => {
    const member = await db.user.create({ data: createUserData(`member-create-${randomUUID()}`) });
    const membershipId = await addWorkspaceMember(workspaceA, member.id);

    const result = await tasksService.create({
      title: "member assignee",
      priority: "low",
      assigneeUserId: member.id,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assigneeUserId).toBe(member.id);

    await hardDeleteTasks([result.value.id]);
    await hardDeleteMembers([membershipId]);
    await hardDeleteUsers([member.id]);
  });

  it("rejects addChild when assigneeUserId is not a workspace member", async () => {
    const parent = await tasksService.create({
      title: "parent for outsider child",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const outsider = await db.user.create({ data: createUserData(`outsider-child-${randomUUID()}`) });

    const result = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "outsider child",
      priority: "low",
      assigneeUserId: outsider.id,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });
    }

    const taskIds = [parent.value.id];
    if (result.ok) taskIds.push(result.value.id);
    await hardDeleteTasks(taskIds);
    await hardDeleteUsers([outsider.id]);
  });

  it("rejects splitTask when a part assigneeUserId is not a workspace member", async () => {
    const original = await tasksService.create({
      title: "split with outsider part",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!original.ok) throw new Error("setup failed");
    const member = await db.user.create({ data: createUserData(`member-split-${randomUUID()}`) });
    const outsider = await db.user.create({ data: createUserData(`outsider-split-${randomUUID()}`) });
    const membershipId = await addWorkspaceMember(workspaceA, member.id);

    const result = await tasksService.splitTask(original.value.id, workspaceA, [
      {
        title: "part with member",
        priority: "medium",
        assigneeUserId: member.id,
        workspaceId: workspaceA,
      },
      {
        title: "part with outsider",
        priority: "medium",
        assigneeUserId: outsider.id,
        workspaceId: workspaceA,
      },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });
    }

    const taskIds = [original.value.id];
    if (result.ok) taskIds.push(...result.value.map((t) => t.id));
    await hardDeleteTasks(taskIds);
    await hardDeleteMembers([membershipId]);
    await hardDeleteUsers([member.id, outsider.id]);
  });
});

describe("tasksService related resource workspace scope (workspace-resource-scope task 3.3, Requirement 3.5)", () => {
  it("rejects create when caseId belongs to another workspace", async () => {
    const foreignCase = await db.case.create({
      data: { name: `foreign-case-${randomUUID()}`, workspaceId: workspaceB },
    });

    const result = await tasksService.create({
      title: "cross-ws case",
      priority: "low",
      caseId: foreignCase.id,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });

    await hardDeleteCases([foreignCase.id]);
  });

  it("rejects create when parentTaskId belongs to another workspace", async () => {
    const foreignParent = await tasksService.create({
      title: "parent in B",
      priority: "low",
      workspaceId: workspaceB,
    });
    if (!foreignParent.ok) throw new Error("setup failed");

    const result = await tasksService.create({
      title: "child in A",
      priority: "low",
      parentTaskId: foreignParent.value.id,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });

    await hardDeleteTasks([foreignParent.value.id]);
  });

  it("rejects create when caseId does not exist", async () => {
    const result = await tasksService.create({
      title: "missing case",
      priority: "low",
      caseId: randomUUID(),
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });
  });

  it("rejects update when caseId belongs to another workspace", async () => {
    const created = await tasksService.create({
      title: "update case later",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const foreignCase = await db.case.create({
      data: { name: `foreign-case-upd-${randomUUID()}`, workspaceId: workspaceB },
    });

    const result = await tasksService.update(created.value.id, workspaceA, { caseId: foreignCase.id });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });

    await hardDeleteTasks([created.value.id]);
    await hardDeleteCases([foreignCase.id]);
  });

  it("rejects addChild when caseId belongs to another workspace", async () => {
    const parent = await tasksService.create({
      title: "parent for cross-ws case child",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const foreignCase = await db.case.create({
      data: { name: `foreign-case-child-${randomUUID()}`, workspaceId: workspaceB },
    });

    const result = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "child with foreign case",
      priority: "low",
      caseId: foreignCase.id,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });
    }

    const taskIds = [parent.value.id];
    if (result.ok) taskIds.push(result.value.id);
    await hardDeleteTasks(taskIds);
    await hardDeleteCases([foreignCase.id]);
  });

  it("rejects splitTask when a part caseId belongs to another workspace", async () => {
    const original = await tasksService.create({
      title: "split with foreign case part",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!original.ok) throw new Error("setup failed");
    const foreignCase = await db.case.create({
      data: { name: `foreign-case-split-${randomUUID()}`, workspaceId: workspaceB },
    });

    const result = await tasksService.splitTask(original.value.id, workspaceA, [
      {
        title: "part with foreign case",
        priority: "medium",
        caseId: foreignCase.id,
        workspaceId: workspaceA,
      },
      {
        title: "part ok",
        priority: "medium",
        workspaceId: workspaceA,
      },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });
    }

    const taskIds = [original.value.id];
    if (result.ok) taskIds.push(...result.value.map((t) => t.id));
    await hardDeleteTasks(taskIds);
    await hardDeleteCases([foreignCase.id]);
  });

  it("rejects updateDevelopmentStage when developmentStageId belongs to another workspace", async () => {
    const created = await tasksService.create({
      title: "stage cross-ws",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");
    const foreignStage = await db.developmentStage.create({
      data: { name: `foreign-stage-${randomUUID()}`, order: 0, workspaceId: workspaceB },
    });

    const result = await tasksService.updateDevelopmentStage(created.value.id, workspaceA, foreignStage.id);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });

    await hardDeleteTasks([created.value.id]);
    await hardDeleteStages([foreignStage.id]);
  });

  it("accepts create when caseId and parentTaskId belong to the current workspace", async () => {
    const sameCase = await db.case.create({
      data: { name: `same-case-${randomUUID()}`, workspaceId: workspaceA },
    });
    const parent = await tasksService.create({
      title: "same-ws parent",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");

    const result = await tasksService.create({
      title: "same-ws child",
      priority: "low",
      caseId: sameCase.id,
      parentTaskId: parent.value.id,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.caseId).toBe(sameCase.id);
    expect(result.value.parentTaskId).toBe(parent.value.id);

    await hardDeleteTasks([result.value.id, parent.value.id]);
    await hardDeleteCases([sameCase.id]);
  });
});

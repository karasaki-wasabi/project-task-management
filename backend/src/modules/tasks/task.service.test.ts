import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import type { RecordActorInput } from "../activity-logs/activity-log.types.js";
import { tasksService as rawTasksService } from "./task.service.js";

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

async function hardDeleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(
    `DELETE FROM activity_logs WHERE task_id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
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

function testActor(): RecordActorInput {
  return { type: "user", userId: ownerUserId };
}

const tasksService = {
  ...rawTasksService,
  create(input: Parameters<typeof rawTasksService.create>[0]) {
    return rawTasksService.create(input, testActor());
  },
  updateStatus(
    taskId: Parameters<typeof rawTasksService.updateStatus>[0],
    workspaceId: Parameters<typeof rawTasksService.updateStatus>[1],
    status: Parameters<typeof rawTasksService.updateStatus>[2],
  ) {
    return rawTasksService.updateStatus(taskId, workspaceId, status, testActor());
  },
  updateDevelopmentStage(
    taskId: Parameters<typeof rawTasksService.updateDevelopmentStage>[0],
    workspaceId: Parameters<typeof rawTasksService.updateDevelopmentStage>[1],
    developmentStageId: Parameters<typeof rawTasksService.updateDevelopmentStage>[2],
    assigneeUserId?: Parameters<typeof rawTasksService.updateDevelopmentStage>[4],
  ) {
    return rawTasksService.updateDevelopmentStage(
      taskId,
      workspaceId,
      developmentStageId,
      testActor(),
      assigneeUserId,
    );
  },
  update(
    taskId: Parameters<typeof rawTasksService.update>[0],
    workspaceId: Parameters<typeof rawTasksService.update>[1],
    input: Parameters<typeof rawTasksService.update>[2],
  ) {
    return rawTasksService.update(taskId, workspaceId, input, testActor());
  },
  addChild(
    parentTaskId: Parameters<typeof rawTasksService.addChild>[0],
    workspaceId: Parameters<typeof rawTasksService.addChild>[1],
    input: Parameters<typeof rawTasksService.addChild>[2],
  ) {
    return rawTasksService.addChild(parentTaskId, workspaceId, input, testActor());
  },
  splitTask(
    taskId: Parameters<typeof rawTasksService.splitTask>[0],
    workspaceId: Parameters<typeof rawTasksService.splitTask>[1],
    parts: Parameters<typeof rawTasksService.splitTask>[2],
  ) {
    return rawTasksService.splitTask(taskId, workspaceId, parts, testActor());
  },
  delete(
    taskId: Parameters<typeof rawTasksService.delete>[0],
    workspaceId: Parameters<typeof rawTasksService.delete>[1],
    requestId?: Parameters<typeof rawTasksService.delete>[3],
  ) {
    return rawTasksService.delete(taskId, workspaceId, testActor(), requestId);
  },
};

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
  await db.$executeRawUnsafe(
    `DELETE FROM development_stages WHERE workspace_id IN (?, ?)`,
    workspaceA,
    workspaceB,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM activity_logs WHERE task_id IN (
      SELECT id FROM tasks WHERE workspace_id IN (?, ?)
    )`,
    workspaceA,
    workspaceB,
  );
  await db.$executeRawUnsafe(`DELETE FROM tasks WHERE workspace_id IN (?, ?)`, workspaceA, workspaceB);
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDeleteUsers([ownerUserId]);
  await db.$disconnect();
});

describe("tasksService (task 3.1 + workspace-resource-scope 3.1)", () => {
  it("指定されたワークスペースで status not_started のタスクを作成 (Requirement 1.1)", async () => {
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

  it("空の title でタスクを作成した場合、400 エラーを返す (Requirement 1.1)", async () => {
    const result = await tasksService.create({ title: "  ", priority: "low", workspaceId: workspaceA });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "validation_error", message: expect.any(String) });
  });

  it("free-form detail を保存し、memo/scheduledDate を省略 (Requirement 1.1, 1.2, 2.1, 2.2)", async () => {
    const result = await tasksService.create({
      title: "task with detail",
      priority: "medium",
      detail: "call the client",
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.detail).toBe("call the client");
    expect(result.value).not.toHaveProperty("memo");
    expect(result.value).not.toHaveProperty("scheduledDate");
    expect(Object.hasOwn(result.value, "scheduledEndDate")).toBe(true);

    await hardDeleteTasks([result.value.id]);
  });

  it("scheduledEndDate を保存 (Requirement 2.1, 2.3)", async () => {
    const scheduledEndDate = new Date("2026-08-15");
    const result = await tasksService.create({
      title: "task with end date",
      priority: "medium",
      scheduledEndDate,
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scheduledEndDate).toEqual(scheduledEndDate);
    expect(result.value).not.toHaveProperty("scheduledDate");

    await hardDeleteTasks([result.value.id]);
  });

  it("caseId がない場合、isRequiredForCase を false に強制 (design.md TasksService Implementation Notes)", async () => {
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

  it("on_hold に設定した場合、status を更新し、表示されたままにする (Requirement 1.3, 1.4)", async () => {
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

  it("status が変更された場合、completedAt は変更されない (2.4)", async () => {
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

  it("terminal stage のタスクで status を変更した場合、400 エラーを返す (4.5)", async () => {
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

  it("存在しないタスクの status を更新した場合、404 エラーを返す", async () => {
    const result = await tasksService.updateStatus(randomUUID(), workspaceA, "ready_for_handoff");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "not_found", taskId: expect.any(String) });
  });

  it("同じワークスペースの ID でタスクを取得 (Requirement 1.2, 3.2)", async () => {
    const created = await tasksService.create({ title: "detail me", priority: "medium", workspaceId: workspaceA });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.getById(created.value.id, workspaceA);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(created.value.id);
    expect(result.value.title).toBe("detail me");

    await hardDeleteTasks([created.value.id]);
  });

  it("存在しないタスクを取得した場合、404 エラーを返す", async () => {
    const result = await tasksService.getById(randomUUID(), workspaceA);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("別のワークスペースのタスクを取得した場合、404 エラーを返す (Requirement 3.3)", async () => {
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

  it("title, priority, detail を更新 (Requirement 1.1, 1.3)", async () => {
    const created = await tasksService.create({
      title: "original",
      priority: "low",
      detail: "old detail",
      workspaceId: workspaceA,
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, workspaceA, {
      title: "renamed",
      priority: "high",
      detail: "new detail",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("renamed");
    expect(result.value.priority).toBe("high");
    expect(result.value.detail).toBe("new detail");
    expect(result.value).not.toHaveProperty("memo");

    await hardDeleteTasks([created.value.id]);
  });

  it("空の title で更新した場合、400 エラーを返す", async () => {
    const created = await tasksService.create({ title: "keep me", priority: "low", workspaceId: workspaceA });
    if (!created.ok) throw new Error("setup failed");

    const result = await tasksService.update(created.value.id, workspaceA, { title: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("validation_error");

    await hardDeleteTasks([created.value.id]);
  });

  it("assigneeUserId を更新し、既存の assignee を上書き (Requirement 7.2)", async () => {
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

  it("caseId がクリアされた場合、isRequiredForCase を false に強制", async () => {
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

  it("存在しないタスクを更新した場合、404 エラーを返す", async () => {
    const result = await tasksService.update(randomUUID(), workspaceA, { title: "ghost" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("別のワークスペースのタスクを更新した場合、404 エラーを返す (Requirement 3.3)", async () => {
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

  it("caseId と assigneeUserId でワークスペース内のリストをフィルタリング (Requirement 7.2)", async () => {
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

  it("要求されたワークスペースのタスクのみをリスト (Requirement 3.1)", async () => {
    const inA = await tasksService.create({ title: "list-a", priority: "low", workspaceId: workspaceA });
    const inB = await tasksService.create({ title: "list-b", priority: "low", workspaceId: workspaceB });
    if (!inA.ok || !inB.ok) throw new Error("setup failed");

    const listA = await tasksService.list({ workspaceId: workspaceA });
    expect(listA.map((t) => t.id)).toContain(inA.value.id);
    expect(listA.map((t) => t.id)).not.toContain(inB.value.id);

    await hardDeleteTasks([inA.value.id, inB.value.id]);
  });

  it("unassignedCase が true の場合、未割り当てのタスクのみをリスト (Requirement 3.1)", async () => {
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

  it("unassignedCase が設定されていない場合、既存の caseId-filter 動作を変更しない (regression)", async () => {
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

  it("論理削除し、リストから除外 (Requirement 9.3, 9.4)", async () => {
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

  it("存在しないタスクを削除した場合、404 エラーを返す", async () => {
    const result = await tasksService.delete(randomUUID(), workspaceA);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("別のワークスペースのタスクを削除した場合、404 エラーを返す (Requirement 3.3)", async () => {
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
  it("親タスクの下に子タスクを追加 (Requirement 2.1)", async () => {
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

  it("子タスクが独自の子タスクを持つことができる (Requirement 2.2)", async () => {
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

  it("存在しない親タスクの下に子タスクを追加した場合、404 エラーを返す", async () => {
    const result = await tasksService.addChild(randomUUID(), workspaceA, {
      title: "orphan",
      priority: "low",
      workspaceId: workspaceA,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("caseId と priority を継承した部分タスクに分割 (Requirement 2.3)", async () => {
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

  it("2つ未満の部分タスクに分割した場合、400 エラーを返す", async () => {
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

  it("存在しないタスクを分割した場合、404 エラーを返す", async () => {
    const result = await tasksService.splitTask(randomUUID(), workspaceA, [
      { title: "a", priority: "low", workspaceId: workspaceA },
      { title: "b", priority: "low", workspaceId: workspaceA },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("ready_for_handoff を親タスクに設定し、子タスクが未完了の場合、completedAt は変更されない (2.4, 4.2)", async () => {
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
  it("developmentStageId を更新し、タスクの status に依存しない (Requirement 12.9)", async () => {
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

  it("未割り当てのタスクに assignee を設定 (Requirement 12.7)", async () => {
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

  it("タスクにすでに担当者が設定されている場合、担当者を上書きしない (Requirement 12.8)", async () => {
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

  it("存在しないタスクの developmentStageId を更新した場合、404 エラーを返す", async () => {
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

  it("completed に移動した場合、completedAt をスタンプし、normal に移動した場合、completedAt をクリアし、再度 completed に移動した場合、completedAt を再スタンプ (2.1, 2.2)", async () => {
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

  it("cancelled に移動した場合、completedAt をスタンプしない (2.3)", async () => {
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

  it("completed から null stage に移動した場合、completedAt をクリア (2.2, 2.5)", async () => {
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

  it("stage が実際に変更された場合のみ status を not_started にリセット (4.4)", async () => {
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

  it("子タスクが未完了の場合、completed に移動できない (5.1, 5.4)", async () => {
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

  it("子タスクがキャンセルされた場合、completed に移動できる (5.2)", async () => {
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

  it("子タスクが未完了の場合、completed に移動できない (5.1, 5.2)", async () => {
    const parent = await tasksService.create({
      title: "parent then cancel child",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "open then cancelled",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!child.ok) throw new Error("setup failed");
    const cancelled = await createStage("cancelled", 924);
    const completed = await createStage("completed", 915);

    const blocked = await tasksService.updateDevelopmentStage(
      parent.value.id,
      workspaceA,
      completed.id,
    );
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toEqual({ type: "incomplete_children", taskId: parent.value.id });

    const childCancelled = await tasksService.updateDevelopmentStage(
      child.value.id,
      workspaceA,
      cancelled.id,
    );
    if (!childCancelled.ok) throw new Error("setup failed");

    const allowed = await tasksService.updateDevelopmentStage(
      parent.value.id,
      workspaceA,
      completed.id,
    );
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.value.completedAt).toBeInstanceOf(Date);

    await hardDeleteTasks([child.value.id, parent.value.id]);
    await hardDeleteStages([cancelled.id, completed.id]);
  });

  it("子タスクが論理削除された場合、completed に移動できる", async () => {
    const parent = await tasksService.create({
      title: "parent soft-deleted child",
      priority: "medium",
      workspaceId: workspaceA,
    });
    if (!parent.ok) throw new Error("setup failed");
    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "soft-deleted child",
      priority: "low",
      workspaceId: workspaceA,
    });
    if (!child.ok) throw new Error("setup failed");
    const deleted = await tasksService.delete(child.value.id, workspaceA);
    if (!deleted.ok) throw new Error("setup failed");
    const completed = await createStage("completed", 916);

    const result = await tasksService.updateDevelopmentStage(
      parent.value.id,
      workspaceA,
      completed.id,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.completedAt).toBeInstanceOf(Date);

    await hardDeleteTasks([child.value.id, parent.value.id]);
    await hardDeleteStages([completed.id]);
  });

  it("子タスクが未完了の場合、cancelled に移動できる (5.3)", async () => {
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

  it("stage が未設定のタスクを直接 terminal stage に移動できる (2.5)", async () => {
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

  it("completed stage のタスクを分割できない (5.5)", async () => {
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

  it("cancelled stage のタスクを分割できない (5.5)", async () => {
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

  it("completed stage の親タスクの下に子タスクを作成できない (5.6)", async () => {
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

  it("completed stage の親タスクの下に子タスクを追加できない (5.6)", async () => {
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

  it("cancelled stage の親タスクの下に子タスクを作成できない (5.6)", async () => {
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
  it("assigneeUserId がワークスペースメンバーでない場合、タスクを作成できない", async () => {
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

  it("assigneeUserId がワークスペースメンバーでない場合、タスクを更新できない", async () => {
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

  it("assigneeUserId がワークスペースメンバーでない場合、developmentStageId を更新できない", async () => {
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

  it("assigneeUserId がワークスペースメンバーの場合、タスクを作成できる", async () => {
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

  it("assigneeUserId がワークスペースメンバーでない場合、子タスクを追加できない", async () => {
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

  it("assigneeUserId がワークスペースメンバーでない場合、部分タスクを分割できない", async () => {
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
  it("caseId が別のワークスペースに属する場合、タスクを作成できない", async () => {
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

  it("parentTaskId が別のワークスペースに属する場合、タスクを作成できない", async () => {
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

  it("caseId が存在しない場合、タスクを作成できない", async () => {
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

  it("caseId が別のワークスペースに属する場合、タスクを更新できない", async () => {
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

  it("caseId が別のワークスペースに属する場合、子タスクを追加できない", async () => {
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

  it("caseId が別のワークスペースに属する場合、部分タスクを分割できない", async () => {
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

  it("developmentStageId が別のワークスペースに属する場合、developmentStageId を更新できない", async () => {
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

  it("caseId と parentTaskId が同じワークスペースに属する場合、タスクを作成できる", async () => {
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

describe("tasksService module boundary (module-boundary-cleanup task 3)", () => {
  it("caseReadService と stages getById(client) を使用する (Requirements 1.1–1.4, 3.2)", () => {
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), "task.service.ts");
    const source = readFileSync(sourcePath, "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    const codeWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(importLines).not.toMatch(/case\.repository/);
    expect(importLines).not.toMatch(/caseRepository/);
    expect(importLines).toMatch(/case-read\.service/);
    expect(importLines).toMatch(/caseReadService/);
    expect(importLines).toMatch(/development-stage\.service/);
    expect(importLines).toMatch(/developmentStagesService/);
    expect(codeWithoutComments).not.toMatch(/\b(?:db|client)\.developmentStage\b/);
    expect(codeWithoutComments).toMatch(
      /developmentStagesService\.getById\(\s*[\s\S]*?,\s*[\s\S]*?,\s*client\s*,?\s*\)/,
    );
  });
});

describe("tasksService storyPoints (velocity-dashboard 2.3; Requirements 1.5, 2.1–2.5)", () => {
  it("子タスクがある場合、storyPoints を更新できない (1.5, 2.5)", async () => {
    const parent = await tasksService.create({
      title: "parent-with-child",
      priority: "medium",
      workspaceId: workspaceA,
      storyPoints: 5,
    });
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "child",
      priority: "low",
      workspaceId: workspaceA,
      storyPoints: 3,
    });
    expect(child.ok).toBe(true);
    if (!child.ok) return;

    const rejected = await tasksService.update(parent.value.id, workspaceA, { storyPoints: 9 });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.error.type).toBe("validation_error");

    await hardDeleteTasks([child.value.id, parent.value.id]);
  });

  it("leaf storyPoints を更新し、field_changed のタイムラインを記録 (2.2)", async () => {
    const leaf = await tasksService.create({
      title: "leaf-points",
      priority: "medium",
      workspaceId: workspaceA,
    });
    expect(leaf.ok).toBe(true);
    if (!leaf.ok) return;

    const updated = await tasksService.update(leaf.value.id, workspaceA, { storyPoints: 8 });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.storyPoints).toBe(8);

    const log = await db.activityLog.findFirst({
      where: {
        taskId: leaf.value.id,
        operationType: "field_changed",
        fieldName: "storyPoints",
      },
    });
    expect(log).toMatchObject({ beforeValue: null, afterValue: "8" });

    await hardDeleteTasks([leaf.value.id]);
  });

  it("parentTaskId を使用して親タスクを再計算 (2.1, 2.3)", async () => {
    const parent = await tasksService.create({
      title: "create-parent",
      priority: "medium",
      workspaceId: workspaceA,
      storyPoints: 99,
    });
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    const child = await tasksService.create({
      title: "create-child",
      priority: "low",
      workspaceId: workspaceA,
      parentTaskId: parent.value.id,
      storyPoints: 4,
    });
    expect(child.ok).toBe(true);
    if (!child.ok) return;

    const refreshed = await tasksService.getById(parent.value.id, workspaceA);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.value.storyPoints).toBe(4);

    const parentPointLogs = await db.activityLog.findMany({
      where: {
        taskId: parent.value.id,
        operationType: "field_changed",
        fieldName: "storyPoints",
      },
    });
    expect(parentPointLogs).toHaveLength(0);

    await hardDeleteTasks([child.value.id, parent.value.id]);
  });

  it("addChild で親タスクを再計算 (2.1, 2.3)", async () => {
    const parent = await tasksService.create({
      title: "addchild-parent",
      priority: "medium",
      workspaceId: workspaceA,
      storyPoints: 50,
    });
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    const child = await tasksService.addChild(parent.value.id, workspaceA, {
      title: "addchild-child",
      priority: "low",
      workspaceId: workspaceA,
      storyPoints: 7,
    });
    expect(child.ok).toBe(true);
    if (!child.ok) return;

    const refreshed = await tasksService.getById(parent.value.id, workspaceA);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.value.storyPoints).toBe(7);

    await hardDeleteTasks([child.value.id, parent.value.id]);
  });

  it("splitTask で分割元を再計算 (2.1, 2.3)", async () => {
    const original = await tasksService.create({
      title: "split-source",
      priority: "high",
      workspaceId: workspaceA,
      storyPoints: 12,
    });
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const parts = await tasksService.splitTask(original.value.id, workspaceA, [
      { title: "part-a", priority: "medium", workspaceId: workspaceA, storyPoints: 2 },
      { title: "part-b", priority: "medium", workspaceId: workspaceA, storyPoints: 5 },
    ]);
    expect(parts.ok).toBe(true);
    if (!parts.ok) return;

    const refreshed = await tasksService.getById(original.value.id, workspaceA);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.value.storyPoints).toBe(7);

    await hardDeleteTasks([...parts.value.map((p) => p.id), original.value.id]);
  });

  it("leaf storyPoints が変更された場合、現在の親タスクを再計算 (2.2, 2.4)", async () => {
    const root = await tasksService.create({
      title: "recalc-root",
      priority: "medium",
      workspaceId: workspaceA,
    });
    expect(root.ok).toBe(true);
    if (!root.ok) return;

    const mid = await tasksService.create({
      title: "recalc-mid",
      priority: "medium",
      workspaceId: workspaceA,
      parentTaskId: root.value.id,
    });
    expect(mid.ok).toBe(true);
    if (!mid.ok) return;

    const leaf = await tasksService.create({
      title: "recalc-leaf",
      priority: "low",
      workspaceId: workspaceA,
      parentTaskId: mid.value.id,
      storyPoints: 3,
    });
    expect(leaf.ok).toBe(true);
    if (!leaf.ok) return;

    const updated = await tasksService.update(leaf.value.id, workspaceA, { storyPoints: 10 });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    const midAfter = await tasksService.getById(mid.value.id, workspaceA);
    const rootAfter = await tasksService.getById(root.value.id, workspaceA);
    expect(midAfter.ok && midAfter.value.storyPoints).toBe(10);
    expect(rootAfter.ok && rootAfter.value.storyPoints).toBe(10);

    const ancestorLogs = await db.activityLog.findMany({
      where: {
        taskId: { in: [mid.value.id, root.value.id] },
        operationType: "field_changed",
        fieldName: "storyPoints",
      },
    });
    expect(ancestorLogs).toHaveLength(0);

    await hardDeleteTasks([leaf.value.id, mid.value.id, root.value.id]);
  });

  it("parentTaskId が変更された場合、古い親タスクと新しい親タスクを再計算 (2.1)", async () => {
    const oldParent = await tasksService.create({
      title: "old-parent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    const newParent = await tasksService.create({
      title: "new-parent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    expect(oldParent.ok && newParent.ok).toBe(true);
    if (!oldParent.ok || !newParent.ok) return;

    const child = await tasksService.create({
      title: "moving-child",
      priority: "low",
      workspaceId: workspaceA,
      parentTaskId: oldParent.value.id,
      storyPoints: 6,
    });
    expect(child.ok).toBe(true);
    if (!child.ok) return;

    const moved = await tasksService.update(child.value.id, workspaceA, {
      parentTaskId: newParent.value.id,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const oldAfter = await tasksService.getById(oldParent.value.id, workspaceA);
    const newAfter = await tasksService.getById(newParent.value.id, workspaceA);
    expect(oldAfter.ok && oldAfter.value.storyPoints).toBeNull();
    expect(newAfter.ok && newAfter.value.storyPoints).toBe(6);

    await hardDeleteTasks([child.value.id, oldParent.value.id, newParent.value.id]);
  });

  it("削除で親タスクを再計算 (2.1)", async () => {
    const parent = await tasksService.create({
      title: "delete-parent",
      priority: "medium",
      workspaceId: workspaceA,
    });
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    const keep = await tasksService.create({
      title: "keep-child",
      priority: "low",
      workspaceId: workspaceA,
      parentTaskId: parent.value.id,
      storyPoints: 2,
    });
    const drop = await tasksService.create({
      title: "drop-child",
      priority: "low",
      workspaceId: workspaceA,
      parentTaskId: parent.value.id,
      storyPoints: 5,
    });
    expect(keep.ok && drop.ok).toBe(true);
    if (!keep.ok || !drop.ok) return;

    const deleted = await tasksService.delete(drop.value.id, workspaceA);
    expect(deleted.ok).toBe(true);

    const refreshed = await tasksService.getById(parent.value.id, workspaceA);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.value.storyPoints).toBe(2);

    await hardDeleteTasks([drop.value.id, keep.value.id, parent.value.id]);
  });
});

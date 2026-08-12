// taskRepository workspace scope (workspace-resource-scope task 3.1;
// Requirements 1.1, 1.2, 3.1, 3.2, 3.3). Integration tests against real MySQL.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import { taskRepository } from "./task.repository.js";

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

let workspaceA: VerifiedWorkspaceId;
let workspaceB: VerifiedWorkspaceId;
let userId: string;

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("task-repo-ws") });
  userId = user.id;
  const [a, b] = await Promise.all([
    db.workspace.create({ data: { name: `task-repo-a-${randomUUID()}`, createdByUserId: userId } }),
    db.workspace.create({ data: { name: `task-repo-b-${randomUUID()}`, createdByUserId: userId } }),
  ]);
  workspaceA = asVerified(a.id);
  workspaceB = asVerified(b.id);
});

afterAll(async () => {
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDelete("users", [userId]);
  await db.$disconnect();
});

describe("taskRepository (workspace-resource-scope 3.1)", () => {
  it("creates a task with workspaceId (Requirement 1.1, 1.2)", async () => {
    const created = await taskRepository.create({
      title: "repo task",
      priority: "high",
      workspaceId: workspaceA,
    });

    expect(created.workspaceId).toBe(workspaceA);
    expect(created.status).toBe("not_started");

    await hardDelete("tasks", [created.id]);
  });

  it("finds a task by id within the same workspace", async () => {
    const created = await taskRepository.create({
      title: "findable",
      priority: "low",
      workspaceId: workspaceA,
    });

    const found = await taskRepository.findById(created.id, workspaceA);
    expect(found?.id).toBe(created.id);

    await hardDelete("tasks", [created.id]);
  });

  it("returns null when the task belongs to another workspace (Requirement 3.3)", async () => {
    const created = await taskRepository.create({
      title: "other ws",
      priority: "low",
      workspaceId: workspaceB,
    });

    const found = await taskRepository.findById(created.id, workspaceA);
    expect(found).toBeNull();

    await hardDelete("tasks", [created.id]);
  });

  it("lists only tasks in the requested workspace (Requirement 3.1)", async () => {
    const inA = await taskRepository.create({
      title: "in-a",
      priority: "low",
      workspaceId: workspaceA,
    });
    const inB = await taskRepository.create({
      title: "in-b",
      priority: "low",
      workspaceId: workspaceB,
    });

    const listA = await taskRepository.list({ workspaceId: workspaceA });
    expect(listA.map((t) => t.id)).toContain(inA.id);
    expect(listA.map((t) => t.id)).not.toContain(inB.id);

    await hardDelete("tasks", [inA.id, inB.id]);
  });

  it("update fails when the task belongs to another workspace (Requirement 3.3)", async () => {
    const created = await taskRepository.create({
      title: "update other",
      priority: "low",
      workspaceId: workspaceB,
    });

    await expect(
      taskRepository.update(created.id, workspaceA, { title: "hijack" }),
    ).rejects.toMatchObject({ code: "P2025" });

    await hardDelete("tasks", [created.id]);
  });

  it("delete fails when the task belongs to another workspace (Requirement 3.3)", async () => {
    const created = await taskRepository.create({
      title: "delete other",
      priority: "low",
      workspaceId: workspaceB,
    });

    await expect(taskRepository.delete(created.id, workspaceA)).rejects.toMatchObject({
      code: "P2025",
    });

    await hardDelete("tasks", [created.id]);
  });
});

describe("taskRepository.countIncompleteChildren (task-status-model 3.1)", () => {
  it("counts a ready_for_handoff child as open when its stage is not closed (5.4)", async () => {
    const parent = await taskRepository.create({
      title: "count parent status",
      priority: "medium",
      workspaceId: workspaceA,
    });
    const child = await taskRepository.create({
      title: "handoff but open stage",
      priority: "low",
      parentTaskId: parent.id,
      workspaceId: workspaceA,
    });
    await taskRepository.updateStatus(child.id, workspaceA, "ready_for_handoff", new Date());

    const count = await taskRepository.countIncompleteChildren(parent.id);

    expect(count).toBe(1);

    await hardDelete("tasks", [child.id, parent.id]);
  });

  it("does not count a cancelled-stage child as incomplete (5.2)", async () => {
    const parent = await taskRepository.create({
      title: "count parent cancelled",
      priority: "medium",
      workspaceId: workspaceA,
    });
    const cancelledStage = await db.developmentStage.create({
      data: {
        name: `cancelled-${randomUUID()}`,
        order: 930,
        kind: "cancelled",
        workspaceId: workspaceA,
      },
    });
    const child = await taskRepository.create({
      title: "cancelled child",
      priority: "low",
      parentTaskId: parent.id,
      workspaceId: workspaceA,
    });
    await taskRepository.updateDevelopmentStage(child.id, workspaceA, {
      developmentStageId: cancelledStage.id,
    });

    const count = await taskRepository.countIncompleteChildren(parent.id);

    expect(count).toBe(0);

    await hardDelete("tasks", [child.id, parent.id]);
    await hardDelete("development_stages", [cancelledStage.id]);
  });
});

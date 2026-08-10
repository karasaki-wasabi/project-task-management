// developmentStagesService workspace scope (workspace-resource-scope task 6.1;
// Requirements 1.1, 1.2, 3.1, 3.2, 3.3) plus prior DevelopmentStagesService coverage.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import { developmentStagesService } from "./development-stage.service.js";

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

async function hardDeleteStages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM development_stages WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function hardDeleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM tasks WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

const createdStageIds: string[] = [];
const createdTaskIds: string[] = [];

async function createTracked(name: string, workspaceId: VerifiedWorkspaceId) {
  const stage = await developmentStagesService.create(name, workspaceId);
  createdStageIds.push(stage.id);
  return stage;
}

let workspaceA: VerifiedWorkspaceId;
let workspaceB: VerifiedWorkspaceId;
let userId: string;

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("stage-svc-ws") });
  userId = user.id;
  const [a, b] = await Promise.all([
    db.workspace.create({ data: { name: `stage-svc-a-${randomUUID()}`, createdByUserId: userId } }),
    db.workspace.create({ data: { name: `stage-svc-b-${randomUUID()}`, createdByUserId: userId } }),
  ]);
  workspaceA = asVerified(a.id);
  workspaceB = asVerified(b.id);
});

afterEach(async () => {
  await hardDeleteTasks(createdTaskIds.splice(0));
  await hardDeleteStages(createdStageIds.splice(0));
});

afterAll(async () => {
  await db.$executeRawUnsafe(
    `DELETE FROM development_stages WHERE workspace_id IN (?, ?)`,
    workspaceA,
    workspaceB,
  );
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDelete("users", [userId]);
  await db.$disconnect();
});

describe("developmentStagesService (task 14.1 + workspace-resource-scope 6.1)", () => {
  it("creates a development stage in the given workspace, appended to the end of that workspace's order (Requirements 1.1, 12.1)", async () => {
    const a = await createTracked(`spec-${randomUUID()}`, workspaceA);
    const b = await createTracked(`impl-${randomUUID()}`, workspaceA);

    expect(a.workspaceId).toBe(workspaceA);
    expect(b.workspaceId).toBe(workspaceA);
    expect(b.order).toBe(a.order + 1);
  });

  it("rejects an empty name", async () => {
    await expect(developmentStagesService.create("  ", workspaceA)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("renames a development stage in the current workspace", async () => {
    const stage = await createTracked(`before-${randomUUID()}`, workspaceA);

    const renamed = await developmentStagesService.rename(stage.id, workspaceA, "after");

    expect(renamed.name).toBe("after");
  });

  it("returns not_found (404) when renaming a non-existent stage", async () => {
    await expect(developmentStagesService.rename(randomUUID(), workspaceA, "x")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns not_found (404) when renaming a stage in another workspace (Requirement 3.3)", async () => {
    const foreign = await createTracked(`foreign-rename-${randomUUID()}`, workspaceB);

    await expect(developmentStagesService.rename(foreign.id, workspaceA, "hijacked")).rejects.toMatchObject({
      statusCode: 404,
    });

    const stillThere = await developmentStagesService.findById(foreign.id, workspaceB);
    expect(stillThere?.name).toBe(foreign.name);
  });

  it("reorders stages according to the given id order within the workspace (Requirement 12.2)", async () => {
    const a = await createTracked(`a-${randomUUID()}`, workspaceA);
    const b = await createTracked(`b-${randomUUID()}`, workspaceA);
    // Foreign-workspace stages must not be required in orderedIds.
    await createTracked(`foreign-${randomUUID()}`, workspaceB);
    const others = (await developmentStagesService.list(workspaceA))
      .map((s) => s.id)
      .filter((id) => id !== a.id && id !== b.id);

    const reordered = await developmentStagesService.reorder([b.id, a.id, ...others], workspaceA);

    expect(reordered.slice(0, 2).map((s) => s.id)).toEqual([b.id, a.id]);
    expect(reordered[0].order).toBe(0);
    expect(reordered[1].order).toBe(1);
  });

  it("rejects reorder when orderedIds does not exactly match the current stages in the workspace", async () => {
    const a = await createTracked(`only-${randomUUID()}`, workspaceA);

    await expect(developmentStagesService.reorder([a.id, randomUUID()], workspaceA)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("lists development stages only for the current workspace, ordered by order (Requirements 3.1, 9.4)", async () => {
    const a = await createTracked(`list-a-${randomUUID()}`, workspaceA);
    const b = await createTracked(`list-b-${randomUUID()}`, workspaceA);
    const foreign = await createTracked(`list-foreign-${randomUUID()}`, workspaceB);

    const list = await developmentStagesService.list(workspaceA);
    const ids = list.map((s) => s.id);

    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(foreign.id);
  });

  it("findById returns a stage in the workspace and null for another workspace (scoped reuse API)", async () => {
    const stage = await createTracked(`find-${randomUUID()}`, workspaceA);

    expect(await developmentStagesService.findById(stage.id, workspaceA)).toMatchObject({
      id: stage.id,
      workspaceId: workspaceA,
    });
    expect(await developmentStagesService.findById(stage.id, workspaceB)).toBeNull();
  });

  it("deleting a stage resets developmentStageId to null on tasks that referenced it, and excludes it from list (Requirement 12.5, 9.4)", async () => {
    const stage = await createTracked(`deletable-${randomUUID()}`, workspaceA);
    const task = await db.task.create({
      data: {
        title: `stage-task-${randomUUID()}`,
        priority: "low",
        developmentStageId: stage.id,
        workspaceId: workspaceA,
      },
    });
    createdTaskIds.push(task.id);

    await developmentStagesService.delete(stage.id, workspaceA);
    createdStageIds.splice(createdStageIds.indexOf(stage.id), 1);

    const updatedTask = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updatedTask.developmentStageId).toBeNull();

    const list = await developmentStagesService.list(workspaceA);
    expect(list.some((s) => s.id === stage.id)).toBe(false);
  });

  it("returns not_found (404) when deleting a non-existent stage", async () => {
    await expect(developmentStagesService.delete(randomUUID(), workspaceA)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns not_found (404) when deleting a stage in another workspace (Requirement 3.3)", async () => {
    const foreign = await createTracked(`foreign-delete-${randomUUID()}`, workspaceB);

    await expect(developmentStagesService.delete(foreign.id, workspaceA)).rejects.toMatchObject({
      statusCode: 404,
    });

    const stillThere = await developmentStagesService.list(workspaceB);
    expect(stillThere.some((s) => s.id === foreign.id)).toBe(true);
  });

  it("does not reuse a deleted stage's order value for a newly created stage in the same workspace", async () => {
    const a = await createTracked(`churn-a-${randomUUID()}`, workspaceA);
    const b = await createTracked(`churn-b-${randomUUID()}`, workspaceA);
    await developmentStagesService.delete(a.id, workspaceA);
    createdStageIds.splice(createdStageIds.indexOf(a.id), 1);

    const c = await createTracked(`churn-c-${randomUUID()}`, workspaceA);

    expect(c.order).not.toBe(b.order);
    expect(c.order).toBeGreaterThan(b.order);
  });
});

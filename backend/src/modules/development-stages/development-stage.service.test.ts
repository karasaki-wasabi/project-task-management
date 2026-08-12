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

    const stillThere = await developmentStagesService.getById(foreign.id, workspaceB);
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

  it("list includes kind for each stage (task-status-model 2.1, Requirements 1.1, 1.8)", async () => {
    const stage = await createTracked(`kind-list-${randomUUID()}`, workspaceA);
    await db.developmentStage.create({
      data: {
        name: `completed-${randomUUID()}`,
        order: stage.order + 10,
        kind: "completed",
        workspaceId: workspaceA,
      },
    }).then((row) => createdStageIds.push(row.id));
    await db.developmentStage.create({
      data: {
        name: `cancelled-${randomUUID()}`,
        order: stage.order + 11,
        kind: "cancelled",
        workspaceId: workspaceA,
      },
    }).then((row) => createdStageIds.push(row.id));

    const list = await developmentStagesService.list(workspaceA);
    const byId = new Map(list.map((s) => [s.id, s]));

    expect(byId.get(stage.id)?.kind).toBe("normal");
    expect(list.every((s) => s.kind === "normal" || s.kind === "completed" || s.kind === "cancelled")).toBe(
      true,
    );
    expect(list.some((s) => s.kind === "completed")).toBe(true);
    expect(list.some((s) => s.kind === "cancelled")).toBe(true);
  });

  it("getById returns a stage with kind in the workspace and null for another workspace (task-status-model 2.1)", async () => {
    const stage = await createTracked(`find-${randomUUID()}`, workspaceA);
    const completed = await db.developmentStage.create({
      data: {
        name: `find-completed-${randomUUID()}`,
        order: stage.order + 20,
        kind: "completed",
        workspaceId: workspaceA,
      },
    });
    createdStageIds.push(completed.id);

    expect(await developmentStagesService.getById(stage.id, workspaceA)).toMatchObject({
      id: stage.id,
      workspaceId: workspaceA,
      kind: "normal",
    });
    expect(await developmentStagesService.getById(completed.id, workspaceA)).toMatchObject({
      id: completed.id,
      kind: "completed",
    });
    expect(await developmentStagesService.getById(stage.id, workspaceB)).toBeNull();
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

describe("developmentStagesService kind invariants (task-status-model 2.2, Requirements 1.4–1.7)", () => {
  async function seedTerminalsAfter(baseOrder: number, workspaceId: VerifiedWorkspaceId) {
    const completed = await db.developmentStage.create({
      data: {
        name: `completed-${randomUUID()}`,
        order: baseOrder + 1,
        kind: "completed",
        workspaceId,
      },
    });
    const cancelled = await db.developmentStage.create({
      data: {
        name: `cancelled-${randomUUID()}`,
        order: baseOrder + 2,
        kind: "cancelled",
        workspaceId,
      },
    });
    createdStageIds.push(completed.id, cancelled.id);
    return { completed, cancelled };
  }

  it("creates stages as kind normal (Requirement 1.4)", async () => {
    const stage = await createTracked(`always-normal-${randomUUID()}`, workspaceA);

    expect(stage.kind).toBe("normal");
  });

  it("inserts a new stage after the last normal stage, not after terminal stages (Requirement 1.4)", async () => {
    const normal = await createTracked(`normal-before-${randomUUID()}`, workspaceA);
    const { completed, cancelled } = await seedTerminalsAfter(normal.order, workspaceA);

    const created = await createTracked(`inserted-${randomUUID()}`, workspaceA);

    expect(created.kind).toBe("normal");
    expect(created.order).toBe(normal.order + 1);

    const refreshedCompleted = await developmentStagesService.getById(completed.id, workspaceA);
    const refreshedCancelled = await developmentStagesService.getById(cancelled.id, workspaceA);
    expect(refreshedCompleted?.order).toBe(normal.order + 2);
    expect(refreshedCancelled?.order).toBe(normal.order + 3);

    const list = await developmentStagesService.list(workspaceA);
    const ids = list.map((s) => s.id);
    expect(ids.indexOf(created.id)).toBeLessThan(ids.indexOf(completed.id));
    expect(ids.indexOf(created.id)).toBeLessThan(ids.indexOf(cancelled.id));
  });

  it("rejects deleting a completed stage (Requirement 1.5)", async () => {
    const normal = await createTracked(`keep-${randomUUID()}`, workspaceA);
    const { completed } = await seedTerminalsAfter(normal.order, workspaceA);

    await expect(developmentStagesService.delete(completed.id, workspaceA)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(await developmentStagesService.getById(completed.id, workspaceA)).not.toBeNull();
  });

  it("rejects deleting a cancelled stage (Requirement 1.5)", async () => {
    const normal = await createTracked(`keep-${randomUUID()}`, workspaceA);
    const { cancelled } = await seedTerminalsAfter(normal.order, workspaceA);

    await expect(developmentStagesService.delete(cancelled.id, workspaceA)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(await developmentStagesService.getById(cancelled.id, workspaceA)).not.toBeNull();
  });

  it("allows renaming a terminal stage (Requirement 1.7)", async () => {
    const normal = await createTracked(`rename-base-${randomUUID()}`, workspaceA);
    const { completed } = await seedTerminalsAfter(normal.order, workspaceA);

    const renamed = await developmentStagesService.rename(completed.id, workspaceA, "完了（改）");

    expect(renamed).toMatchObject({ id: completed.id, name: "完了（改）", kind: "completed" });
  });

  it("allows reordering including terminal stages (Requirement 1.7)", async () => {
    const normal = await createTracked(`reorder-base-${randomUUID()}`, workspaceA);
    const { completed, cancelled } = await seedTerminalsAfter(normal.order, workspaceA);
    const others = (await developmentStagesService.list(workspaceA))
      .map((s) => s.id)
      .filter((id) => id !== normal.id && id !== completed.id && id !== cancelled.id);

    const reordered = await developmentStagesService.reorder(
      [cancelled.id, normal.id, completed.id, ...others],
      workspaceA,
    );

    expect(reordered.slice(0, 3).map((s) => s.id)).toEqual([cancelled.id, normal.id, completed.id]);
    expect(reordered[0].kind).toBe("cancelled");
    expect(reordered[2].kind).toBe("completed");
  });
});

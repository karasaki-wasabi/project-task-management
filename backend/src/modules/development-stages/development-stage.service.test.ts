// RED: developmentStagesService does not exist yet (task 14.1, Requirements
// 12.1, 12.2, 12.5). Integration test against real MySQL via shared/db.ts.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { developmentStagesService } from "./development-stage.service.js";

async function hardDeleteStages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM development_stages WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function hardDeleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM tasks WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("developmentStagesService (task 14.1)", () => {
  it("creates a development stage, appended to the end of the order (Requirement 12.1)", async () => {
    const a = await developmentStagesService.create(`spec-${randomUUID()}`);
    const b = await developmentStagesService.create(`impl-${randomUUID()}`);

    expect(b.order).toBe(a.order + 1);

    await hardDeleteStages([a.id, b.id]);
  });

  it("rejects an empty name", async () => {
    await expect(developmentStagesService.create("  ")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("renames a development stage", async () => {
    const stage = await developmentStagesService.create(`before-${randomUUID()}`);

    const renamed = await developmentStagesService.rename(stage.id, "after");

    expect(renamed.name).toBe("after");

    await hardDeleteStages([stage.id]);
  });

  it("returns not_found (404) when renaming a non-existent stage", async () => {
    await expect(developmentStagesService.rename(randomUUID(), "x")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("reorders stages according to the given id order (Requirement 12.2)", async () => {
    // reorder's precondition (design.md) is "orderedIds must contain
    // exactly the current set of non-deleted stages" — this DB can already
    // have other stages in it (seed/demo data, or ones other tests left
    // behind), so the call below must include them too, not just the two
    // this test creates. Putting a/b first keeps the assertions about
    // their relative order and order values (0/1) meaningful regardless of
    // how many other stages exist.
    const a = await developmentStagesService.create(`a-${randomUUID()}`);
    const b = await developmentStagesService.create(`b-${randomUUID()}`);
    const others = (await developmentStagesService.list()).map((s) => s.id).filter((id) => id !== a.id && id !== b.id);

    const reordered = await developmentStagesService.reorder([b.id, a.id, ...others]);

    expect(reordered.slice(0, 2).map((s) => s.id)).toEqual([b.id, a.id]);
    expect(reordered[0].order).toBe(0);
    expect(reordered[1].order).toBe(1);

    await hardDeleteStages([a.id, b.id]);
  });

  it("rejects reorder when orderedIds does not exactly match the current stages", async () => {
    const a = await developmentStagesService.create(`only-${randomUUID()}`);

    await expect(developmentStagesService.reorder([a.id, randomUUID()])).rejects.toMatchObject({ statusCode: 400 });

    await hardDeleteStages([a.id]);
  });

  it("lists development stages ordered by their order value", async () => {
    const a = await developmentStagesService.create(`list-a-${randomUUID()}`);
    const b = await developmentStagesService.create(`list-b-${randomUUID()}`);

    const list = await developmentStagesService.list();
    const ids = list.map((s) => s.id);

    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));

    await hardDeleteStages([a.id, b.id]);
  });

  it("deleting a stage resets developmentStageId to null on tasks that referenced it, and excludes it from list (Requirement 12.5, 9.4)", async () => {
    const stage = await developmentStagesService.create(`deletable-${randomUUID()}`);
    const task = await db.task.create({
      data: { title: `stage-task-${randomUUID()}`, priority: "low", developmentStageId: stage.id },
    });

    await developmentStagesService.delete(stage.id);

    const updatedTask = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updatedTask.developmentStageId).toBeNull();

    const list = await developmentStagesService.list();
    expect(list.some((s) => s.id === stage.id)).toBe(false);

    await hardDeleteTasks([task.id]);
    await hardDeleteStages([stage.id]);
  });

  it("returns not_found (404) when deleting a non-existent stage", async () => {
    await expect(developmentStagesService.delete(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("does not reuse a deleted stage's order value for a newly created stage", async () => {
    const a = await developmentStagesService.create(`churn-a-${randomUUID()}`);
    const b = await developmentStagesService.create(`churn-b-${randomUUID()}`);
    await developmentStagesService.delete(a.id);

    const c = await developmentStagesService.create(`churn-c-${randomUUID()}`);

    expect(c.order).not.toBe(b.order);
    expect(c.order).toBeGreaterThan(b.order);

    await hardDeleteStages([b.id, c.id]);
  });
});

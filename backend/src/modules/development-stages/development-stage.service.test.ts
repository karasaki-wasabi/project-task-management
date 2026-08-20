import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  it("指定されたワークスペースに development stage を作成し、そのワークスペースの order の末尾に追加 (Requirements 1.1, 12.1)", async () => {
    const a = await createTracked(`spec-${randomUUID()}`, workspaceA);
    const b = await createTracked(`impl-${randomUUID()}`, workspaceA);

    expect(a.workspaceId).toBe(workspaceA);
    expect(b.workspaceId).toBe(workspaceA);
    expect(b.order).toBe(a.order + 1);
  });

  it("空の name を受け取った場合、400 エラーを返す", async () => {
    await expect(developmentStagesService.create("  ", workspaceA)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("現在のワークスペースで development stage をリネーム", async () => {
    const stage = await createTracked(`before-${randomUUID()}`, workspaceA);

    const renamed = await developmentStagesService.rename(stage.id, workspaceA, "after");

    expect(renamed.name).toBe("after");
  });

  it("存在しない development stage をリネームした場合、404 エラーを返す", async () => {
    await expect(developmentStagesService.rename(randomUUID(), workspaceA, "x")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("別のワークスペースで development stage をリネームした場合、404 エラーを返す (Requirement 3.3)", async () => {
    const foreign = await createTracked(`foreign-rename-${randomUUID()}`, workspaceB);

    await expect(developmentStagesService.rename(foreign.id, workspaceA, "hijacked")).rejects.toMatchObject({
      statusCode: 404,
    });

    const stillThere = await developmentStagesService.getById(foreign.id, workspaceB);
    expect(stillThere?.name).toBe(foreign.name);
  });

  it("指定された id 順に development stage を並べ替える (Requirement 12.2)", async () => {
    const a = await createTracked(`a-${randomUUID()}`, workspaceA);
    const b = await createTracked(`b-${randomUUID()}`, workspaceA);
    await createTracked(`foreign-${randomUUID()}`, workspaceB);
    const others = (await developmentStagesService.list(workspaceA))
      .map((s) => s.id)
      .filter((id) => id !== a.id && id !== b.id);

    const reordered = await developmentStagesService.reorder([b.id, a.id, ...others], workspaceA);

    expect(reordered.slice(0, 2).map((s) => s.id)).toEqual([b.id, a.id]);
    expect(reordered[0].order).toBe(0);
    expect(reordered[1].order).toBe(1);
  });

  it("orderedIds が現在のワークスペースの development stage と完全に一致しない場合、reorder を拒否 (Requirement 12.2)", async () => {
    const a = await createTracked(`only-${randomUUID()}`, workspaceA);

    await expect(developmentStagesService.reorder([a.id, randomUUID()], workspaceA)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("現在のワークスペースの development stage のみを返し、order で並べ替える (Requirements 3.1, 9.4)", async () => {
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

  it("list で各 development stage の kind を含む (task-status-model 2.1, Requirements 1.1, 1.8)", async () => {
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

  it("getById で workspace 内の kind を持つ development stage を返し、別のワークスペースの場合は null を返す (task-status-model 2.1)", async () => {
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

  it("development stage を削除すると、それを参照しているタスクの developmentStageId を null にリセットし、list から除外する (Requirement 12.5, 9.4)", async () => {
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

  it("存在しない development stage を削除した場合、404 エラーを返す", async () => {
    await expect(developmentStagesService.delete(randomUUID(), workspaceA)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("別のワークスペースで development stage を削除した場合、404 エラーを返す (Requirement 3.3)", async () => {
    const foreign = await createTracked(`foreign-delete-${randomUUID()}`, workspaceB);

    await expect(developmentStagesService.delete(foreign.id, workspaceA)).rejects.toMatchObject({
      statusCode: 404,
    });

    const stillThere = await developmentStagesService.list(workspaceB);
    expect(stillThere.some((s) => s.id === foreign.id)).toBe(true);
  });

  it("削除された development stage の order 値を同じワークスペースで新しい development stage を作成する際に再利用しない", async () => {
    const a = await createTracked(`churn-a-${randomUUID()}`, workspaceA);
    const b = await createTracked(`churn-b-${randomUUID()}`, workspaceA);
    await developmentStagesService.delete(a.id, workspaceA);
    createdStageIds.splice(createdStageIds.indexOf(a.id), 1);

    const c = await createTracked(`churn-c-${randomUUID()}`, workspaceA);

    expect(c.order).not.toBe(b.order);
    expect(c.order).toBeGreaterThan(b.order);
  });
});

describe("developmentStagesService kind 不変条件 (task-status-model 2.2, Requirements 1.4–1.7)", () => {
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

  it("development stage を kind normal で作成 (Requirement 1.4)", async () => {
    const stage = await createTracked(`always-normal-${randomUUID()}`, workspaceA);

    expect(stage.kind).toBe("normal");
  });

  it("最後の normal stage の後に新しい development stage を挿入し、terminal stage の後ではない (Requirement 1.4)", async () => {
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

  it("completed development stage を削除した場合、400 エラーを返す (Requirement 1.5)", async () => {
    const normal = await createTracked(`keep-${randomUUID()}`, workspaceA);
    const { completed } = await seedTerminalsAfter(normal.order, workspaceA);

    await expect(developmentStagesService.delete(completed.id, workspaceA)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(await developmentStagesService.getById(completed.id, workspaceA)).not.toBeNull();
  });

  it("cancelled development stage を削除した場合、400 エラーを返す (Requirement 1.5)", async () => {
    const normal = await createTracked(`keep-${randomUUID()}`, workspaceA);
    const { cancelled } = await seedTerminalsAfter(normal.order, workspaceA);

    await expect(developmentStagesService.delete(cancelled.id, workspaceA)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(await developmentStagesService.getById(cancelled.id, workspaceA)).not.toBeNull();
  });

  it("terminal development stage をリネームできる (Requirement 1.7)", async () => {
    const normal = await createTracked(`rename-base-${randomUUID()}`, workspaceA);
    const { completed } = await seedTerminalsAfter(normal.order, workspaceA);

    const renamed = await developmentStagesService.rename(completed.id, workspaceA, "完了（改）");

    expect(renamed).toMatchObject({ id: completed.id, name: "完了（改）", kind: "completed" });
  });

  it("terminal development stage を含む reorder ができる (Requirement 1.7)", async () => {
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

describe("developmentStagesService getById(client) と ensureTerminalStages (module-boundary-cleanup 2.2)", () => {
  let terminalWorkspace: VerifiedWorkspaceId;

  beforeAll(async () => {
    const workspace = await db.workspace.create({
      data: { name: `stage-svc-terminal-${randomUUID()}`, createdByUserId: userId },
    });
    terminalWorkspace = asVerified(workspace.id);
  });

  afterAll(async () => {
    await db.$executeRawUnsafe(`DELETE FROM development_stages WHERE workspace_id = ?`, terminalWorkspace);
    await hardDelete("workspaces", [terminalWorkspace]);
  });

  it("getById で未コミットの行を TX client で見えるようにし、default client では見えない (Requirement 3.2)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const created = await tx.developmentStage.create({
          data: {
            name: `tx-get-${randomUUID()}`,
            order: 50,
            kind: "normal",
            workspaceId: terminalWorkspace,
          },
        });

        const inside = await developmentStagesService.getById(created.id, terminalWorkspace, tx);
        expect(inside).toMatchObject({
          id: created.id,
          workspaceId: terminalWorkspace,
          kind: "normal",
          name: created.name,
        });

        const outside = await developmentStagesService.getById(created.id, terminalWorkspace);
        expect(outside).toBeNull();

        throw new Error("rollback-getById-tx-proof");
      }),
    ).rejects.toThrow("rollback-getById-tx-proof");
  });

  it("TX client で別のワークスペースの development stage を取得した場合、null を返す (Requirement 1.4)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const created = await tx.developmentStage.create({
          data: {
            name: `tx-scope-${randomUUID()}`,
            order: 51,
            kind: "normal",
            workspaceId: workspaceB,
          },
        });

        expect(await developmentStagesService.getById(created.id, terminalWorkspace, tx)).toBeNull();
        expect(await developmentStagesService.getById(created.id, workspaceB, tx)).toMatchObject({
          id: created.id,
        });

        throw new Error("rollback-getById-scope-tx-proof");
      }),
    ).rejects.toThrow("rollback-getById-scope-tx-proof");
  });

  it("ensureTerminalStages で workspace 作成時と同じ初期状態の completed/cancelled development stage を作成 (Requirement 4.4)", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await developmentStagesService.ensureTerminalStages(terminalWorkspace, tx);

        const stages = await tx.developmentStage.findMany({
          where: { workspaceId: terminalWorkspace },
          orderBy: { order: "asc" },
        });
        expect(stages.map((s) => ({ name: s.name, kind: s.kind, order: s.order }))).toEqual([
          { name: "完了", kind: "completed", order: 0 },
          { name: "中止", kind: "cancelled", order: 1 },
        ]);

        const completed = stages[0];
        const cancelled = stages[1];
        expect(await developmentStagesService.getById(completed.id, terminalWorkspace, tx)).toMatchObject({
          name: "完了",
          kind: "completed",
          order: 0,
          workspaceId: terminalWorkspace,
        });
        expect(await developmentStagesService.getById(cancelled.id, terminalWorkspace, tx)).toMatchObject({
          name: "中止",
          kind: "cancelled",
          order: 1,
          workspaceId: terminalWorkspace,
        });

        expect(await developmentStagesService.getById(completed.id, terminalWorkspace)).toBeNull();
        expect(await developmentStagesService.getById(cancelled.id, terminalWorkspace)).toBeNull();

        throw new Error("rollback-ensureTerminal-tx-proof");
      }),
    ).rejects.toThrow("rollback-ensureTerminal-tx-proof");
  });
});

describe("developmentStagesService モジュール境界 (module-boundary-cleanup task 4.2)", () => {
  it("taskIntegrityService.clearDevelopmentStage と repository delete を orchestrate する (Requirements 1.1, 1.4, 2.1, 3.1, 3.3, 4.3, 4.6)", () => {
    const sourcePath = join(dirname(fileURLToPath(import.meta.url)), "development-stage.service.ts");
    const source = readFileSync(sourcePath, "utf8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    const codeWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(importLines).toMatch(/task-integrity\.service/);
    expect(importLines).toMatch(/taskIntegrityService/);
    expect(importLines).not.toMatch(/task\.service/);
    expect(importLines).not.toMatch(/\btasksService\b/);
    expect(codeWithoutComments).toMatch(/taskIntegrityService\.clearDevelopmentStage/);
    expect(codeWithoutComments).not.toMatch(/\btasksService\b/);

    const deleteFn = codeWithoutComments.match(/async delete\([\s\S]*?\n  \},/);
    expect(deleteFn?.[0]).toBeDefined();
    const deleteBody = deleteFn?.[0] ?? "";
    const clearIdx = deleteBody.indexOf("taskIntegrityService.clearDevelopmentStage");
    const repoDeleteIdx = deleteBody.indexOf("developmentStageRepository.delete");
    expect(clearIdx).toBeGreaterThan(-1);
    expect(repoDeleteIdx).toBeGreaterThan(clearIdx);
    expect(deleteBody).toMatch(/\$transaction/);
  });
});

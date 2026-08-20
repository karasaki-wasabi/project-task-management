import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import { tasksService } from "../tasks/task.service.js";
import { throughputService } from "./throughput.service.js";

const createdTaskIds: string[] = [];
const createdStageIds: string[] = [];
const createdCaseIds: string[] = [];
let workspaceId: string;
let verifiedWorkspaceId: VerifiedWorkspaceId;
let ownerUserId: string;

const taskActor = () => ({ type: "user" as const, userId: ownerUserId });

const THROUGHPUT_BAND_START = new Date("2023-11-01T00:00:00.000Z");
const THROUGHPUT_BAND_END_EXCLUSIVE = new Date("2024-04-01T00:00:00.000Z");

const NOW_MID_WEEK = new Date("2024-01-10T12:00:00.000Z");

async function completedTask(
  completedAt: Date,
  options: { workspaceId?: string; storyPoints?: number | null } = {},
): Promise<string> {
  const task = await db.task.create({
    data: {
      title: `task-${randomUUID()}`,
      priority: "low",
      status: "ready_for_handoff",
      completedAt,
      workspaceId: options.workspaceId ?? workspaceId,
      storyPoints: options.storyPoints ?? null,
    },
  });
  createdTaskIds.push(task.id);
  return task.id;
}

function getSummary(
  periodType: "week" | "month",
  rangeCount: number,
  now: Date = NOW_MID_WEEK,
  caseId?: string,
  scope: VerifiedWorkspaceId = verifiedWorkspaceId,
) {
  return throughputService.getSummary(periodType, rangeCount, scope, caseId, now);
}

async function cleanup(): Promise<void> {
  if (createdTaskIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM activity_logs WHERE task_id IN (${createdTaskIds.map(() => "?").join(",")})`,
      ...createdTaskIds,
    );
    await db.$executeRawUnsafe(
      `DELETE FROM tasks WHERE id IN (${createdTaskIds.map(() => "?").join(",")})`,
      ...createdTaskIds,
    );
    createdTaskIds.length = 0;
  }
  if (createdCaseIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM activity_logs WHERE task_id IN (SELECT id FROM tasks WHERE case_id IN (${createdCaseIds.map(() => "?").join(",")}))`,
      ...createdCaseIds,
    );
    await db.$executeRawUnsafe(
      `DELETE FROM tasks WHERE case_id IN (${createdCaseIds.map(() => "?").join(",")})`,
      ...createdCaseIds,
    );
  }
  if (createdStageIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM development_stages WHERE id IN (${createdStageIds.map(() => "?").join(",")})`,
      ...createdStageIds,
    );
    createdStageIds.length = 0;
  }
  if (createdCaseIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM cases WHERE id IN (${createdCaseIds.map(() => "?").join(",")})`,
      ...createdCaseIds,
    );
    createdCaseIds.length = 0;
  }
}

async function createCase(options: { endDate?: Date | null } = {}): Promise<string> {
  const caseRow = await db.case.create({
    data: {
      name: `throughput-case-${randomUUID()}`,
      endDate: options.endDate === undefined ? new Date("2030-06-01T00:00:00.000Z") : options.endDate,
      workspaceId,
    },
  });
  createdCaseIds.push(caseRow.id);
  return caseRow.id;
}

async function openTask(caseId: string, storyPoints: number | null = null): Promise<string> {
  const task = await db.task.create({
    data: {
      title: `open-${randomUUID()}`,
      priority: "low",
      workspaceId,
      caseId,
      storyPoints,
    },
  });
  createdTaskIds.push(task.id);
  return task.id;
}

async function completedTaskForCase(
  caseId: string,
  completedAt: Date,
  storyPoints: number | null = null,
): Promise<string> {
  const completedStage = await createStage("completed", 900 + createdStageIds.length);
  const task = await db.task.create({
    data: {
      title: `done-${randomUUID()}`,
      priority: "low",
      status: "ready_for_handoff",
      completedAt,
      workspaceId,
      caseId,
      storyPoints,
      developmentStageId: completedStage.id,
    },
  });
  createdTaskIds.push(task.id);
  return task.id;
}

async function purgeThroughputDateBand(): Promise<void> {
  await db.$executeRawUnsafe(
    `DELETE FROM activity_logs WHERE task_id IN (
      SELECT id FROM tasks WHERE completed_at >= ? AND completed_at < ?
    )`,
    THROUGHPUT_BAND_START,
    THROUGHPUT_BAND_END_EXCLUSIVE,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM tasks WHERE completed_at >= ? AND completed_at < ?`,
    THROUGHPUT_BAND_START,
    THROUGHPUT_BAND_END_EXCLUSIVE,
  );
  createdTaskIds.length = 0;
}

async function createStage(kind: "normal" | "completed" | "cancelled", order: number) {
  const stage = await db.developmentStage.create({
    data: {
      name: `${kind}-${randomUUID()}`,
      order,
      kind,
      workspaceId,
    },
  });
  createdStageIds.push(stage.id);
  return stage;
}

async function completeIntoBand(taskId: string, completedStageId: string, completedAt: Date): Promise<void> {
  const moved = await tasksService.updateDevelopmentStage(
    taskId,
    verifiedWorkspaceId,
    completedStageId,
    taskActor(),
  );
  if (!moved.ok) throw new Error(`move to completed failed: ${JSON.stringify(moved.error)}`);
  expect(moved.value.completedAt).toBeInstanceOf(Date);
  createdTaskIds.push(taskId);
  await db.task.update({ where: { id: taskId }, data: { completedAt } });
}

beforeAll(async () => {
  const owner = await db.user.create({ data: createUserData(`throughput-owner-${randomUUID()}`) });
  ownerUserId = owner.id;
  const workspace = await db.workspace.create({
    data: { name: `throughput-ws-${randomUUID()}`, createdByUserId: ownerUserId },
  });
  workspaceId = workspace.id;
  verifiedWorkspaceId = workspaceId as VerifiedWorkspaceId;
});

beforeEach(async () => {
  await purgeThroughputDateBand();
});

afterAll(async () => {
  await cleanup();
  await purgeThroughputDateBand();
  if (workspaceId) {
    await db.$executeRawUnsafe(`DELETE FROM tasks WHERE workspace_id = ?`, workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM development_stages WHERE workspace_id = ?`, workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM cases WHERE workspace_id = ?`, workspaceId);
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
  if (ownerUserId) {
    await db.user.delete({ where: { id: ownerUserId } }).catch(() => undefined);
  }
  await db.$disconnect();
});

describe("throughputService (task 7.1)", () => {
  it("throughputService.getSummary で最新の完了した週内の完了したタスクをカウント (Requirement 6.1)", async () => {
    await completedTask(new Date("2024-01-03T09:00:00.000Z"));
    await completedTask(new Date("2024-01-05T18:00:00.000Z"));
    await completedTask(new Date("2024-01-09T09:00:00.000Z"));

    const summary = await getSummary("week", 1);

    expect(summary.periods).toHaveLength(1);
    expect(summary.periods[0].periodStart.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(summary.periods[0].completedCount).toBe(2);
    expect(summary.periods[0].completedPoints).toBe(0);

    await cleanup();
  });

  it("throughputService.getSummary で periodStart で昇順にソートされた期間を返す (Requirement 6.2)", async () => {
    const summary = await getSummary("week", 3);

    expect(summary.periods).toHaveLength(3);
    const starts = summary.periods.map((p) => p.periodStart.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(summary.periods[2].periodStart.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });

  it("throughputService.getSummary で rangeCount < 1 を拒否する", async () => {
    await expect(getSummary("week", 0)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throughputService.getSummary で forecastNextPeriodCount: null を返す (Requirement 6.4)", async () => {
    const summary = await getSummary("week", 1);

    expect(summary.forecastNextPeriodCount).toBeNull();
  });

  it("throughputService.getSummary で count と points の予測を null で返す (Requirements 6.1–6.3)", async () => {
    await completedTask(new Date("2024-01-03T09:00:00.000Z"), { storyPoints: 8 });

    const summary = await getSummary("week", 1);

    expect(summary.periods).toHaveLength(1);
    expect(summary.forecastNextPeriodCount).toBeNull();
    expect(summary.forecastNextPeriodPoints).toBeNull();

    await cleanup();
  });

  it("throughputService.getSummary で last 4 期間の平均を予測 (Requirement 6.3)", async () => {
    await completedTask(new Date("2024-01-03T09:00:00.000Z"));
    await completedTask(new Date("2023-12-26T09:00:00.000Z"));
    await completedTask(new Date("2023-12-27T09:00:00.000Z"));

    const summary = await getSummary("week", 2);

    expect(summary.forecastNextPeriodCount).toBe(2);

    await cleanup();
  });

  it("throughputService.getSummary で next-period points を completedPoints の平均で予測 (Requirements 6.2, 6.3)", async () => {
    await completedTask(new Date("2024-01-03T09:00:00.000Z"), { storyPoints: 5 });
    await completedTask(new Date("2023-12-26T09:00:00.000Z"), { storyPoints: 3 });
    await completedTask(new Date("2023-12-27T09:00:00.000Z"), { storyPoints: 8 });

    const summary = await getSummary("week", 2);

    expect(summary.periods.map((p) => p.completedPoints)).toEqual([11, 5]);
    // average (11+5)/2 = 8; count average (2+1)/2 = 1.5 -> rounds to 2
    expect(summary.forecastNextPeriodPoints).toBe(8);
    expect(summary.forecastNextPeriodCount).toBe(2);

    await cleanup();
  });

  it("throughputService.getSummary で last 4 期間のみを予測に使用し、期間が多い場合でも使用 (Requirements 6.2, 6.3)", async () => {
    for (let i = 0; i < 9; i += 1) {
      await completedTask(new Date("2023-11-27T09:00:00.000Z"));
    }
    await completedTask(new Date("2023-12-04T09:00:00.000Z"));
    await completedTask(new Date("2023-12-11T09:00:00.000Z"));
    await completedTask(new Date("2023-12-18T09:00:00.000Z"));
    await completedTask(new Date("2023-12-18T15:00:00.000Z"));
    await completedTask(new Date("2023-12-25T09:00:00.000Z"));
    await completedTask(new Date("2023-12-25T12:00:00.000Z"));
    await completedTask(new Date("2023-12-25T15:00:00.000Z"));
    await completedTask(new Date("2024-01-01T09:00:00.000Z"));
    await completedTask(new Date("2024-01-01T12:00:00.000Z"));
    await completedTask(new Date("2024-01-01T15:00:00.000Z"));
    await completedTask(new Date("2024-01-01T18:00:00.000Z"));

    const summary = await getSummary("week", 6);

    expect(summary.periods.map((p) => p.completedCount)).toEqual([9, 1, 1, 2, 3, 4]);
    expect(summary.periods[0].periodStart.toISOString()).toBe("2023-11-27T00:00:00.000Z");
    expect(summary.forecastNextPeriodCount).toBe(3);

    await cleanup();
  });

  it("throughputService.getSummary で削除されたタスクも歴史的な期間に含める (Requirement 9.5)", async () => {
    const taskId = await completedTask(new Date("2024-01-03T09:00:00.000Z"));
    const before = await getSummary("week", 1);
    expect(before.periods[0].completedCount).toBe(1);

    await db.task.delete({ where: { id: taskId } });

    const after = await getSummary("week", 1);
    expect(after.periods[0].completedCount).toBe(1);

    await cleanup();
  });

  it("throughputService.getSummary で削除された完了を count と points に含める (Requirements 3.2, 3.5)", async () => {
    const taskId = await completedTask(new Date("2024-01-03T09:00:00.000Z"), { storyPoints: 7 });
    await db.task.delete({ where: { id: taskId } });

    const summary = await getSummary("week", 1);
    expect(summary.periods[0].completedCount).toBe(1);
    expect(summary.periods[0].completedPoints).toBe(7);

    await cleanup();
  });

  it("throughputService.getSummary で parent の完了をカウントし、leaf の points のみを合計 — parent/child の二重カウントはなし (Requirements 3.3, 3.5)", async () => {
    const parent = await db.task.create({
      data: {
        title: `parent-${randomUUID()}`,
        priority: "low",
        status: "ready_for_handoff",
        completedAt: new Date("2024-01-03T09:00:00.000Z"),
        workspaceId,
        storyPoints: 8,
      },
    });
    createdTaskIds.push(parent.id);
    const leaf = await db.task.create({
      data: {
        title: `leaf-${randomUUID()}`,
        priority: "low",
        status: "ready_for_handoff",
        completedAt: new Date("2024-01-04T09:00:00.000Z"),
        workspaceId,
        parentTaskId: parent.id,
        storyPoints: 5,
      },
    });
    createdTaskIds.push(leaf.id);
    await completedTask(new Date("2024-01-05T09:00:00.000Z"), { storyPoints: null });

    const summary = await getSummary("week", 1);

    expect(summary.periods[0].completedCount).toBe(3);
    expect(summary.periods[0].completedPoints).toBe(5);

    await cleanup();
  });

  it("throughputService.getSummary で given caseId の期間をフィルタリングし、ワークスペース全体をデフォルトとして残す (Requirements 4.1, 4.2)", async () => {
    const caseA = await createCase();
    const caseB = await createCase();
    await completedTaskForCase(caseA, new Date("2024-01-03T09:00:00.000Z"), 5);
    await completedTaskForCase(caseB, new Date("2024-01-04T09:00:00.000Z"), 10);
    await completedTask(new Date("2024-01-05T09:00:00.000Z"), { storyPoints: 3 });

    try {
      const filtered = await getSummary("week", 1, NOW_MID_WEEK, caseA);
      expect(filtered.periods[0].completedCount).toBe(1);
      expect(filtered.periods[0].completedPoints).toBe(5);
      expect(filtered).toHaveProperty("caseOutlook");

      const whole = await getSummary("week", 1);
      expect(whole.periods[0].completedCount).toBe(3);
      expect(whole.periods[0].completedPoints).toBe(18);
      expect(whole).not.toHaveProperty("caseOutlook");
    } finally {
      await cleanup();
    }
  });

  it("throughputService.getSummary で periodType が 'month' の場合、カレンダー月で集計 (Requirements 4.1, 4.2)", async () => {
    const nowMidMonth = new Date("2024-03-15T12:00:00.000Z");
    await completedTask(new Date("2024-02-01T00:00:00.000Z"));
    await completedTask(new Date("2024-02-29T23:59:59.000Z"));
    await completedTask(new Date("2024-03-01T00:00:00.000Z"));

    const summary = await getSummary("month", 1, nowMidMonth);

    expect(summary.periods[0].periodStart.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(summary.periods[0].completedCount).toBe(2);

    await cleanup();
  });

  it("throughputService.getSummary で requested workspace 外の完了を除外し、completedPoints を返す (Requirements 3.1, 3.2)", async () => {
    const otherWorkspace = await db.workspace.create({
      data: { name: `throughput-other-${randomUUID()}`, createdByUserId: ownerUserId },
    });
    await completedTask(new Date("2024-01-03T09:00:00.000Z"), { storyPoints: 5 });
    await completedTask(new Date("2024-01-04T09:00:00.000Z"), { storyPoints: 3 });
    await completedTask(new Date("2024-01-05T09:00:00.000Z"), {
      workspaceId: otherWorkspace.id,
      storyPoints: 99,
    });

    try {
      const summary = await getSummary("week", 1);
      expect(summary.periods[0].completedCount).toBe(2);
      expect(summary.periods[0].completedPoints).toBe(8);
    } finally {
      await cleanup();
      await db.$executeRawUnsafe(`DELETE FROM tasks WHERE workspace_id = ?`, otherWorkspace.id);
      await db.workspace.delete({ where: { id: otherWorkspace.id } }).catch(() => undefined);
    }
  });
});

describe("throughputService completion stamp non-regression (task-status-model 7.1)", () => {
  it("throughputService.getSummary で completed に移動した後、completedAt が null になるとカウントが減る (7.1, 7.4)", async () => {
    const created = await tasksService.create(
      {
        title: `throughput-stage-roundtrip-${randomUUID()}`,
        priority: "low",
        workspaceId: verifiedWorkspaceId,
      },
      taskActor(),
    );
    if (!created.ok) throw new Error("setup failed");
    const completed = await createStage("completed", 810);
    const normal = await createStage("normal", 100);
    const bandStamp = new Date("2024-01-03T09:00:00.000Z");

    const before = await getSummary("week", 1);
    expect(before.periods[0].completedCount).toBe(0);

    await completeIntoBand(created.value.id, completed.id, bandStamp);
    const afterEnter = await getSummary("week", 1);
    expect(afterEnter.periods[0].completedCount).toBe(1);

    const left = await tasksService.updateDevelopmentStage(
      created.value.id,
      verifiedWorkspaceId,
      normal.id,
      taskActor(),
    );
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    expect(left.value.completedAt).toBeNull();

    const afterLeave = await getSummary("week", 1);
    expect(afterLeave.periods[0].completedCount).toBe(0);

    await cleanup();
  });

  it("throughputService.getSummary で cancelled-stage のタスクはカウントされない — stage-kind フィルターなし (7.2)", async () => {
    const created = await tasksService.create(
      {
        title: `throughput-cancelled-${randomUUID()}`,
        priority: "low",
        workspaceId: verifiedWorkspaceId,
      },
      taskActor(),
    );
    if (!created.ok) throw new Error("setup failed");
    createdTaskIds.push(created.value.id);
    const cancelled = await createStage("cancelled", 820);

    const cancelledMove = await tasksService.updateDevelopmentStage(
      created.value.id,
      verifiedWorkspaceId,
      cancelled.id,
      taskActor(),
    );
    expect(cancelledMove.ok).toBe(true);
    if (!cancelledMove.ok) return;
    expect(cancelledMove.value.completedAt).toBeNull();

    const afterCancel = await getSummary("week", 1);
    expect(afterCancel.periods[0].completedCount).toBe(0);

    await db.task.update({
      where: { id: created.value.id },
      data: { completedAt: new Date("2024-01-03T09:00:00.000Z") },
    });
    const afterForcedStamp = await getSummary("week", 1);
    expect(afterForcedStamp.periods[0].completedCount).toBe(1);

    await cleanup();
  });

  it("throughputService.getSummary で completedAt が null の場合、status のみではカウントされない (7.3)", async () => {
    const task = await db.task.create({
      data: {
        title: `throughput-status-only-${randomUUID()}`,
        priority: "low",
        status: "ready_for_handoff",
        completedAt: null,
        workspaceId,
      },
    });
    createdTaskIds.push(task.id);

    const summary = await getSummary("week", 1);
    expect(summary.periods[0].completedCount).toBe(0);

    await cleanup();
  });
});

describe("throughputService module boundary (module-boundary-cleanup task 4.4 / velocity-dashboard 3.1)", () => {
  it("throughputService.getSummary で countCompletedWithPoints を委譲; task.closure, throughput.repository, task Prisma なし", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sourcePath = join(dir, "throughput.service.ts");
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
    expect(importLines).toMatch(/case-read\.service/);
    expect(importLines).toMatch(/caseReadService/);
    expect(importLines).not.toMatch(/throughput\.repository/);
    expect(importLines).not.toMatch(/throughputRepository/);
    expect(importLines).not.toMatch(/task\.closure/);
    expect(importLines).not.toMatch(/case\.service/);
    expect(importLines).not.toMatch(/caseService/);
    expect(codeWithoutComments).toMatch(
      /taskIntegrityService\.countCompletedWithPointsInPeriodIncludingDeleted/,
    );
    expect(codeWithoutComments).toMatch(/taskIntegrityService\.countOpenTasksWithPoints/);
    expect(codeWithoutComments).toMatch(/caseReadService\.findInWorkspace/);
    expect(codeWithoutComments).not.toMatch(/countCompletedInPeriodIncludingDeleted/);
    expect(codeWithoutComments).not.toMatch(/throughputRepository\.countCompleted/);
    expect(codeWithoutComments).not.toMatch(/\b(?:db|client)\.task\b/);
    expect(codeWithoutComments).not.toMatch(/caseService\.getById/);

    expect(existsSync(join(dir, "throughput.repository.ts"))).toBe(false);

    const productionFiles = readdirSync(dir).filter((name) => name.endsWith(".ts") && !name.includes(".test."));
    for (const name of productionFiles) {
      const fileSource = readFileSync(join(dir, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(fileSource, name).not.toMatch(/\b(?:db|client)\.task\b/);
      expect(fileSource, name).not.toMatch(/task\.closure/);
      expect(name).not.toBe("throughput.repository.ts");
    }
  });
});

describe("throughputService.getSummary で caseOutlook を計算 (velocity-dashboard Requirements 7.1–7.5 / task 6.2)", () => {
  it("throughputService.getSummary で caseId が提供されない場合、caseOutlook を省略", async () => {
    const summary = await getSummary("week", 1);
    expect(summary).not.toHaveProperty("caseOutlook");
  });

  it("throughputService.getSummary で current workspace 外の caseId を拒否し、400 エラーを返す (validation_error)", async () => {
    const otherWorkspace = await db.workspace.create({
      data: { name: `throughput-case-other-${randomUUID()}`, createdByUserId: ownerUserId },
    });
    const foreignCase = await db.case.create({
      data: {
        name: `foreign-${randomUUID()}`,
        endDate: new Date("2030-01-01T00:00:00.000Z"),
        workspaceId: otherWorkspace.id,
      },
    });

    try {
      await expect(getSummary("week", 1, NOW_MID_WEEK, foreignCase.id)).rejects.toMatchObject({
        statusCode: 400,
      });
    } finally {
      await db.$executeRawUnsafe(`DELETE FROM cases WHERE id = ?`, foreignCase.id);
      await db.workspace.delete({ where: { id: otherWorkspace.id } }).catch(() => undefined);
    }
  });

  it.each([
    {
      name: "endDate 未設定 × forecast null → remaining/required/margin all null (7.4)",
      endDate: null as Date | null,
      rangeCount: 1,
      seedForecast: "none" as const,
      expectForecast: null as number | null,
      expected: { remainingPeriods: null, requiredPeriods: null, marginPoints: null },
    },
    {
      name: "endDate 未設定 × forecast 0 → remaining/required/margin all null (7.4)",
      endDate: null,
      rangeCount: 2,
      seedForecast: "zero" as const,
      expectForecast: 0,
      expected: { remainingPeriods: null, requiredPeriods: null, marginPoints: null },
    },
    {
      name: "endDate 未設定 × forecast >0 → remaining/required/margin all null (7.4)",
      endDate: null,
      rangeCount: 2,
      seedForecast: "positive" as const,
      expectForecast: 8,
      expected: { remainingPeriods: null, requiredPeriods: null, marginPoints: null },
    },
    {
      name: "endDate 設定 × forecast null → remaining only; required/margin null (7.5)",
      endDate: new Date("2024-01-17T00:00:00.000Z"), // 7 days → 1 week
      rangeCount: 1,
      seedForecast: "none" as const,
      expectForecast: null,
      expected: { remainingPeriods: 1, requiredPeriods: null, marginPoints: null },
    },
    {
      name: "endDate 設定 × forecast 0 → remaining only; required/margin null (7.5)",
      endDate: new Date("2024-01-24T00:00:00.000Z"), // 14 days → 2 weeks
      rangeCount: 2,
      seedForecast: "zero" as const,
      expectForecast: 0,
      expected: { remainingPeriods: 2, requiredPeriods: null, marginPoints: null },
    },
    {
      name: "endDate 設定 × forecast >0 → remaining/required/margin all computed (7.3)",
      endDate: new Date("2024-01-24T00:00:00.000Z"),
      rangeCount: 2,
      seedForecast: "positive" as const,
      expectForecast: 8,
      expected: { remainingPeriods: 2, requiredPeriods: 2, marginPoints: 6 },
    },
  ])("$name", async ({ endDate, rangeCount, seedForecast, expectForecast, expected }) => {
    try {
      const caseId = await createCase({ endDate });
      await openTask(caseId, 10);

      if (seedForecast === "zero") {
        await completedTaskForCase(caseId, new Date("2024-01-03T09:00:00.000Z"), null);
        await completedTaskForCase(caseId, new Date("2023-12-26T09:00:00.000Z"), null);
      } else if (seedForecast === "positive") {
        await completedTaskForCase(caseId, new Date("2024-01-03T09:00:00.000Z"), 5);
        await completedTaskForCase(caseId, new Date("2023-12-26T09:00:00.000Z"), 3);
        await completedTaskForCase(caseId, new Date("2023-12-27T09:00:00.000Z"), 8);
      }

      const summary = await getSummary("week", rangeCount, NOW_MID_WEEK, caseId);

      expect(summary.forecastNextPeriodPoints).toBe(expectForecast);
      expect(summary.caseOutlook).toEqual({
        openTaskCount: 1,
        openPoints: 10,
        ...expected,
      });
    } finally {
      await cleanup();
    }
  });

  it("throughputService.getSummary で endDate が過去の場合、remainingPeriods は 0; required/margin null if forecast unavailable (7.2)", async () => {
    try {
      const caseId = await createCase({ endDate: new Date("2024-01-01T00:00:00.000Z") });
      await openTask(caseId, 7);

      const summary = await getSummary("week", 1, NOW_MID_WEEK, caseId);

      expect(summary.caseOutlook).toEqual({
        openTaskCount: 1,
        openPoints: 7,
        remainingPeriods: 0,
        requiredPeriods: null,
        marginPoints: null,
      });
    } finally {
      await cleanup();
    }
  });

  it("throughputService.getSummary で endDate が今日の UTC の場合、remainingPeriods は 0 (7.2)", async () => {
    try {
      const caseId = await createCase({ endDate: new Date("2024-01-10T00:00:00.000Z") });
      await openTask(caseId, 1);

      const summary = await getSummary("week", 1, NOW_MID_WEEK, caseId);

      expect(summary.caseOutlook?.remainingPeriods).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("throughputService.getSummary で endDate が設定されて forecast points > 0 の場合、requiredPeriods と marginPoints を計算 (7.3)", async () => {
    try {
      const caseId = await createCase({ endDate: new Date("2024-01-24T00:00:00.000Z") });
      await openTask(caseId, 10);
      await completedTaskForCase(caseId, new Date("2024-01-03T09:00:00.000Z"), 5);
      await completedTaskForCase(caseId, new Date("2023-12-26T09:00:00.000Z"), 3);
      await completedTaskForCase(caseId, new Date("2023-12-27T09:00:00.000Z"), 8);

      const summary = await getSummary("week", 2, NOW_MID_WEEK, caseId);

      expect(summary.forecastNextPeriodPoints).toBe(8);
      expect(summary.caseOutlook).toEqual({
        openTaskCount: 1,
        openPoints: 10,
        remainingPeriods: 2,
        requiredPeriods: 2,
        marginPoints: 6,
      });
    } finally {
      await cleanup();
    }
  });

  it("throughputService.getSummary で remainingPeriods を実数で返す (week=7, month=30) (7.2)", async () => {
    try {
      const caseId = await createCase({ endDate: new Date("2024-01-13T00:00:00.000Z") });
      await openTask(caseId, 1);

      const weekSummary = await getSummary("week", 1, NOW_MID_WEEK, caseId);
      expect(weekSummary.caseOutlook?.remainingPeriods).toBeCloseTo(3 / 7, 10);

      const monthSummary = await getSummary("month", 1, NOW_MID_WEEK, caseId);
      expect(monthSummary.caseOutlook?.remainingPeriods).toBeCloseTo(3 / 30, 10);
    } finally {
      await cleanup();
    }
  });
});

// ThroughputService period aggregation (legacy Requirements 6.1-6.4 / 9.5)
// plus task-status-model 7.1 non-regression for completion stamp ↔ digest
// counts (Requirements 7.1-7.4). Integration against real MySQL via shared/db.ts.
//
// Period boundaries: weeks start Monday UTC, months are calendar months UTC
// (design.md ThroughputService Implementation Notes). Periods returned by
// getSummary are past, fully-elapsed periods relative to `now` — the
// in-progress period containing `now` itself is never included (Requirement
// 6.2 "過去複数期間分" / 6.3 "過去の消化ペースをもとにした今後の目安").
//
// task-status-model design: throughput still counts only by completedAt —
// cancelled tasks stay out via the stamp rule (no stage-kind filter).
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

// 共有 DB 上の他テスト／前回失敗の残留 `completedAt` が絶対件数アサートを壊すため、
// このスイート専用の歴史日付帯だけを beforeEach で物理削除して隔離する。
const THROUGHPUT_BAND_START = new Date("2023-11-01T00:00:00.000Z");
const THROUGHPUT_BAND_END_EXCLUSIVE = new Date("2024-04-01T00:00:00.000Z");

// 2024-01-10 is a Wednesday; the Monday-started week containing it is
// 2024-01-08..2024-01-14, so the most recent COMPLETED week is
// 2024-01-01..2024-01-07.
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
  // Cases may still have tasks if a prior assertion skipped cleanup; clear by caseId too.
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

/** Completed for openTaskFilter (stage kind) and for throughput periods (completedAt). */
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

/** Stamp via stage move, then place completedAt inside the isolated historical band. */
async function completeIntoBand(taskId: string, completedStageId: string, completedAt: Date): Promise<void> {
  const moved = await tasksService.updateDevelopmentStage(
    taskId,
    verifiedWorkspaceId,
    completedStageId,
    taskActor(),
  );
  if (!moved.ok) throw new Error(`move to completed failed: ${JSON.stringify(moved.error)}`);
  // Stamp→throughput chain must fail here if completed-stage move stops stamping.
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
  it("counts completed tasks within the most recent completed week (Requirement 6.1)", async () => {
    await completedTask(new Date("2024-01-03T09:00:00.000Z"));
    await completedTask(new Date("2024-01-05T18:00:00.000Z"));
    // Outside the target week (in the in-progress current week) — must not count.
    await completedTask(new Date("2024-01-09T09:00:00.000Z"));

    const summary = await getSummary("week", 1);

    expect(summary.periods).toHaveLength(1);
    expect(summary.periods[0].periodStart.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(summary.periods[0].completedCount).toBe(2);
    expect(summary.periods[0].completedPoints).toBe(0);

    await cleanup();
  });

  it("returns periods sorted ascending by periodStart (Requirement 6.2)", async () => {
    const summary = await getSummary("week", 3);

    expect(summary.periods).toHaveLength(3);
    const starts = summary.periods.map((p) => p.periodStart.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(summary.periods[2].periodStart.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });

  it("rejects rangeCount < 1", async () => {
    await expect(getSummary("week", 0)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns forecastNextPeriodCount: null when fewer than 2 periods are available (Requirement 6.4)", async () => {
    const summary = await getSummary("week", 1);

    expect(summary.forecastNextPeriodCount).toBeNull();
  });

  it("returns both count and points forecasts as null when fewer than 2 periods are available (Requirements 6.1–6.3)", async () => {
    await completedTask(new Date("2024-01-03T09:00:00.000Z"), { storyPoints: 8 });

    const summary = await getSummary("week", 1);

    expect(summary.periods).toHaveLength(1);
    expect(summary.forecastNextPeriodCount).toBeNull();
    expect(summary.forecastNextPeriodPoints).toBeNull();

    await cleanup();
  });

  it("forecasts as the simple average of up to the last 4 periods once >= 2 are available (Requirement 6.3)", async () => {
    await completedTask(new Date("2024-01-03T09:00:00.000Z")); // week of 2024-01-01: 1 task
    await completedTask(new Date("2023-12-26T09:00:00.000Z")); // week of 2023-12-25: 1 task
    await completedTask(new Date("2023-12-27T09:00:00.000Z")); // week of 2023-12-25: +1 (total 2)

    const summary = await getSummary("week", 2);

    // periods: [2023-12-25 (count 2), 2024-01-01 (count 1)] -> average 1.5 -> rounds to 2
    expect(summary.forecastNextPeriodCount).toBe(2);

    await cleanup();
  });

  it("forecasts next-period points as the simple average of completedPoints over the same window (Requirements 6.2, 6.3)", async () => {
    // week of 2024-01-01: 5 points; week of 2023-12-25: 3+8=11 points
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

  it("uses only the last 4 periods for the forecast even when more periods are requested", async () => {
    // 6 consecutive Monday-started weeks ending at the most recent completed
    // week (2024-01-01) relative to NOW_MID_WEEK. The oldest 2 weeks
    // (2023-11-27, 2023-12-04) get a distinctly large count that must be
    // excluded once only the last 4 periods are averaged.
    for (let i = 0; i < 9; i += 1) {
      await completedTask(new Date("2023-11-27T09:00:00.000Z")); // week 0 (oldest): 9
    }
    await completedTask(new Date("2023-12-04T09:00:00.000Z")); // week 1: 1 (also outside the last-4 window)
    await completedTask(new Date("2023-12-11T09:00:00.000Z")); // week 2: 1
    await completedTask(new Date("2023-12-18T09:00:00.000Z"));
    await completedTask(new Date("2023-12-18T15:00:00.000Z")); // week 3: 2
    await completedTask(new Date("2023-12-25T09:00:00.000Z"));
    await completedTask(new Date("2023-12-25T12:00:00.000Z"));
    await completedTask(new Date("2023-12-25T15:00:00.000Z")); // week 4: 3
    await completedTask(new Date("2024-01-01T09:00:00.000Z"));
    await completedTask(new Date("2024-01-01T12:00:00.000Z"));
    await completedTask(new Date("2024-01-01T15:00:00.000Z"));
    await completedTask(new Date("2024-01-01T18:00:00.000Z")); // week 5 (most recent): 4

    const summary = await getSummary("week", 6);

    expect(summary.periods.map((p) => p.completedCount)).toEqual([9, 1, 1, 2, 3, 4]);
    expect(summary.periods[0].periodStart.toISOString()).toBe("2023-11-27T00:00:00.000Z");
    // last 4 = [1, 2, 3, 4] -> average 2.5 -> rounds to 3; the oldest weeks'
    // large counts (9 and 1) must NOT pull this average up.
    expect(summary.forecastNextPeriodCount).toBe(3);

    await cleanup();
  });

  it("still counts a task toward its historical period after the task is soft-deleted (Requirement 9.5)", async () => {
    const taskId = await completedTask(new Date("2024-01-03T09:00:00.000Z"));
    const before = await getSummary("week", 1);
    expect(before.periods[0].completedCount).toBe(1);

    await db.task.delete({ where: { id: taskId } });

    const after = await getSummary("week", 1);
    expect(after.periods[0].completedCount).toBe(1);

    await cleanup();
  });

  it("aggregates by calendar month when periodType is 'month'", async () => {
    // 2024-03-15 is mid-March; the most recent completed month is February
    // 2024 (a leap year, so Feb has 29 days).
    const nowMidMonth = new Date("2024-03-15T12:00:00.000Z");
    await completedTask(new Date("2024-02-01T00:00:00.000Z"));
    await completedTask(new Date("2024-02-29T23:59:59.000Z"));
    await completedTask(new Date("2024-03-01T00:00:00.000Z")); // in-progress month, excluded

    const summary = await getSummary("month", 1, nowMidMonth);

    expect(summary.periods[0].periodStart.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(summary.periods[0].completedCount).toBe(2);

    await cleanup();
  });

  it("excludes completions outside the requested workspace and returns completedPoints (Requirements 3.1, 3.2)", async () => {
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

// task-status-model 7.1: completion stamp ↔ digest non-regression (7.1–7.4).
describe("throughputService completion stamp non-regression (task-status-model 7.1)", () => {
  it("counts after move into completed and drops after move out (7.1, 7.4)", async () => {
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

  it("does not count a cancelled-stage task because completedAt stays null — no stage-kind filter (7.2)", async () => {
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

    // Prove digest still keys only on completedAt: a cancelled-stage row with a
    // forced stamp would still count. Adding a stage-kind exclusion would break this.
    await db.task.update({
      where: { id: created.value.id },
      data: { completedAt: new Date("2024-01-03T09:00:00.000Z") },
    });
    const afterForcedStamp = await getSummary("week", 1);
    expect(afterForcedStamp.periods[0].completedCount).toBe(1);

    await cleanup();
  });

  it("does not count by status alone when completedAt is null (7.3)", async () => {
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
  it("delegates via countCompletedWithPoints; no task.closure, throughput.repository, or task Prisma", () => {
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

describe("throughputService caseOutlook (velocity-dashboard Requirements 7.1–7.5)", () => {
  it("omits caseOutlook when caseId is not provided", async () => {
    const summary = await getSummary("week", 1);
    expect(summary).not.toHaveProperty("caseOutlook");
  });

  it("rejects caseId that is not in the current workspace with 400 (validation_error)", async () => {
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

  it("when endDate is unset: remaining/required/margin are null; open counts still present (7.1, 7.4)", async () => {
    try {
      const caseId = await createCase({ endDate: null });
      await openTask(caseId, 5);
      await openTask(caseId, 3);

      const summary = await getSummary("week", 2, NOW_MID_WEEK, caseId);

      expect(summary.caseOutlook).toEqual({
        openTaskCount: 2,
        openPoints: 8,
        remainingPeriods: null,
        requiredPeriods: null,
        marginPoints: null,
      });
    } finally {
      await cleanup();
    }
  });

  it("when endDate is set but forecast is 0: remainingPeriods only; required/margin null (7.2, 7.5)", async () => {
    try {
      // endDate 14 days after NOW_MID_WEEK UTC midnight → 14/7 = 2 remaining weeks
      const caseId = await createCase({ endDate: new Date("2024-01-24T00:00:00.000Z") });
      await openTask(caseId, 10);
      // Two past periods exist but with 0 completed points → forecastNextPeriodPoints = 0
      await completedTaskForCase(caseId, new Date("2024-01-03T09:00:00.000Z"), null);
      await completedTaskForCase(caseId, new Date("2023-12-26T09:00:00.000Z"), null);

      const summary = await getSummary("week", 2, NOW_MID_WEEK, caseId);

      expect(summary.forecastNextPeriodPoints).toBe(0);
      expect(summary.caseOutlook).toEqual({
        openTaskCount: 1,
        openPoints: 10,
        remainingPeriods: 2,
        requiredPeriods: null,
        marginPoints: null,
      });
    } finally {
      await cleanup();
    }
  });

  it("when endDate is set but forecast is uncalculated: remainingPeriods only; required/margin null (7.5)", async () => {
    try {
      const caseId = await createCase({ endDate: new Date("2024-01-17T00:00:00.000Z") }); // 7 days → 1 week
      await openTask(caseId, 4);

      const summary = await getSummary("week", 1, NOW_MID_WEEK, caseId);

      expect(summary.forecastNextPeriodPoints).toBeNull();
      expect(summary.caseOutlook).toEqual({
        openTaskCount: 1,
        openPoints: 4,
        remainingPeriods: 1,
        requiredPeriods: null,
        marginPoints: null,
      });
    } finally {
      await cleanup();
    }
  });

  it("when endDate is in the past: remainingPeriods is 0; required/margin null if forecast unavailable (7.2)", async () => {
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

  it("when endDate is today UTC: remainingPeriods is 0 (7.2)", async () => {
    try {
      const caseId = await createCase({ endDate: new Date("2024-01-10T00:00:00.000Z") });
      await openTask(caseId, 1);

      const summary = await getSummary("week", 1, NOW_MID_WEEK, caseId);

      expect(summary.caseOutlook?.remainingPeriods).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("computes requiredPeriods and marginPoints when endDate set and forecast points > 0 (7.3)", async () => {
    try {
      // remaining: 14 days / 7 = 2; open 10 pts; forecast (5+11)/2 = 8
      // required = ceil(10/8) = 2; margin = 8*2 - 10 = 6
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

  it("returns remainingPeriods as a real number without flooring (week=7, month=30) (7.2)", async () => {
    try {
      // 3 days after 2024-01-10 → 3/7
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

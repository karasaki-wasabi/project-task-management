// RED: throughputService does not exist yet (task 7.1, Requirements 6.1-6.4,
// 9.5). Integration test against real MySQL via shared/db.ts.
//
// Period boundaries: weeks start Monday UTC, months are calendar months UTC
// (design.md ThroughputService Implementation Notes). Periods returned by
// getSummary are past, fully-elapsed periods relative to `now` — the
// in-progress period containing `now` itself is never included (Requirement
// 6.2 "過去複数期間分" / 6.3 "過去の消化ペースをもとにした今後の目安").
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { throughputService } from "./throughput.service.js";

const createdTaskIds: string[] = [];

async function completedTask(completedAt: Date): Promise<string> {
  const task = await db.task.create({
    data: { title: `task-${randomUUID()}`, priority: "low", status: "done", completedAt },
  });
  createdTaskIds.push(task.id);
  return task.id;
}

async function cleanup(): Promise<void> {
  if (createdTaskIds.length === 0) return;
  await db.$executeRawUnsafe(
    `DELETE FROM tasks WHERE id IN (${createdTaskIds.map(() => "?").join(",")})`,
    ...createdTaskIds,
  );
  createdTaskIds.length = 0;
}

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

// 2024-01-10 is a Wednesday; the Monday-started week containing it is
// 2024-01-08..2024-01-14, so the most recent COMPLETED week is
// 2024-01-01..2024-01-07.
const NOW_MID_WEEK = new Date("2024-01-10T12:00:00.000Z");

describe("throughputService (task 7.1)", () => {
  it("counts completed tasks within the most recent completed week (Requirement 6.1)", async () => {
    await completedTask(new Date("2024-01-03T09:00:00.000Z"));
    await completedTask(new Date("2024-01-05T18:00:00.000Z"));
    // Outside the target week (in the in-progress current week) — must not count.
    await completedTask(new Date("2024-01-09T09:00:00.000Z"));

    const summary = await throughputService.getSummary("week", 1, NOW_MID_WEEK);

    expect(summary.periods).toHaveLength(1);
    expect(summary.periods[0].periodStart.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(summary.periods[0].completedCount).toBe(2);

    await cleanup();
  });

  it("returns periods sorted ascending by periodStart (Requirement 6.2)", async () => {
    const summary = await throughputService.getSummary("week", 3, NOW_MID_WEEK);

    expect(summary.periods).toHaveLength(3);
    const starts = summary.periods.map((p) => p.periodStart.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(summary.periods[2].periodStart.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });

  it("rejects rangeCount < 1", async () => {
    await expect(throughputService.getSummary("week", 0, NOW_MID_WEEK)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns forecastNextPeriodCount: null when fewer than 2 periods are available (Requirement 6.4)", async () => {
    const summary = await throughputService.getSummary("week", 1, NOW_MID_WEEK);

    expect(summary.forecastNextPeriodCount).toBeNull();
  });

  it("forecasts as the simple average of up to the last 4 periods once >= 2 are available (Requirement 6.3)", async () => {
    await completedTask(new Date("2024-01-03T09:00:00.000Z")); // week of 2024-01-01: 1 task
    await completedTask(new Date("2023-12-26T09:00:00.000Z")); // week of 2023-12-25: 1 task
    await completedTask(new Date("2023-12-27T09:00:00.000Z")); // week of 2023-12-25: +1 (total 2)

    const summary = await throughputService.getSummary("week", 2, NOW_MID_WEEK);

    // periods: [2023-12-25 (count 2), 2024-01-01 (count 1)] -> average 1.5 -> rounds to 2
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

    const summary = await throughputService.getSummary("week", 6, NOW_MID_WEEK);

    expect(summary.periods.map((p) => p.completedCount)).toEqual([9, 1, 1, 2, 3, 4]);
    expect(summary.periods[0].periodStart.toISOString()).toBe("2023-11-27T00:00:00.000Z");
    // last 4 = [1, 2, 3, 4] -> average 2.5 -> rounds to 3; the oldest weeks'
    // large counts (9 and 1) must NOT pull this average up.
    expect(summary.forecastNextPeriodCount).toBe(3);

    await cleanup();
  });

  it("still counts a task toward its historical period after the task is soft-deleted (Requirement 9.5)", async () => {
    const taskId = await completedTask(new Date("2024-01-03T09:00:00.000Z"));
    const before = await throughputService.getSummary("week", 1, NOW_MID_WEEK);
    expect(before.periods[0].completedCount).toBe(1);

    await db.task.delete({ where: { id: taskId } });

    const after = await throughputService.getSummary("week", 1, NOW_MID_WEEK);
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

    const summary = await throughputService.getSummary("month", 1, nowMidMonth);

    expect(summary.periods[0].periodStart.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(summary.periods[0].completedCount).toBe(2);

    await cleanup();
  });
});

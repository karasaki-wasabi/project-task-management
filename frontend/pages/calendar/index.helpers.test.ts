import { describe, expect, it } from "vitest";
import type { DateCell } from "~/components/shared/DatePicker.helpers";
import {
  buildTaskMarkersByDate,
  buildWeekCaseLanes,
  colorIndexForCase,
  computeWeekRowBudget,
  shiftMonth,
  truncateDayMarkers,
} from "./index.helpers";

function makeCell(date: string, overrides: Partial<DateCell> = {}): DateCell {
  return {
    date,
    inCurrentMonth: true,
    isToday: false,
    isSelected: false,
    dayOfWeek: 0,
    ...overrides,
  };
}

function makeCase(overrides: Partial<Case> & { id: string }): Case {
  return {
    name: `case-${overrides.id}`,
    startDate: null,
    endDate: null,
    isCompleted: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function makeStage(overrides: Partial<DevelopmentStage> & { id: string }): DevelopmentStage {
  return {
    name: `stage-${overrides.id}`,
    order: 0,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: `task-${overrides.id}`,
    status: "not_started",
    priority: "medium",
    isRequiredForCase: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

// A full Sun-Sat week: 2026-08-02 (Sun) .. 2026-08-08 (Sat).
const WEEK: DateCell[] = [
  makeCell("2026-08-02", { dayOfWeek: 0 }),
  makeCell("2026-08-03", { dayOfWeek: 1 }),
  makeCell("2026-08-04", { dayOfWeek: 2 }),
  makeCell("2026-08-05", { dayOfWeek: 3 }),
  makeCell("2026-08-06", { dayOfWeek: 4 }),
  makeCell("2026-08-07", { dayOfWeek: 5 }),
  makeCell("2026-08-08", { dayOfWeek: 6 }),
];

describe("buildTaskMarkersByDate (task 7.2, Requirement 2.1, 2.2, 2.3, 2.4)", () => {
  const stages = [makeStage({ id: "s1", name: "設計" }), makeStage({ id: "s2", name: "実装" })];

  it("groups tasks with a scheduledDate by local-calendar-day date key", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Task 1", scheduledDate: "2026-08-05T00:00:00.000Z" }),
      makeTask({ id: "t2", title: "Task 2", scheduledDate: "2026-08-05T00:00:00.000Z" }),
      makeTask({ id: "t3", title: "Task 3", scheduledDate: "2026-08-06T00:00:00.000Z" }),
    ];

    const result = buildTaskMarkersByDate(tasks, stages, "2026-08-01");

    expect(result.size).toBe(2);
    expect(result.get("2026-08-05")?.map((m) => m.taskId)).toEqual(["t1", "t2"]);
    expect(result.get("2026-08-06")?.map((m) => m.taskId)).toEqual(["t3"]);
  });

  it("excludes tasks without a scheduledDate", () => {
    const tasks = [
      makeTask({ id: "t1", scheduledDate: undefined }),
      makeTask({ id: "t2", scheduledDate: null }),
      makeTask({ id: "t3", scheduledDate: "2026-08-05T00:00:00.000Z" }),
    ];

    const result = buildTaskMarkersByDate(tasks, stages, "2026-08-01");

    expect(result.size).toBe(1);
    expect(result.get("2026-08-05")?.map((marker) => marker.taskId)).toEqual(["t3"]);
  });

  it("returns an empty map when given no tasks", () => {
    expect(buildTaskMarkersByDate([], stages, "2026-08-01").size).toBe(0);
  });

  it("resolves developmentStageId to the stage's name via the provided stages list", () => {
    const tasks = [
      makeTask({ id: "t1", developmentStageId: "s2", scheduledDate: "2026-08-05T00:00:00.000Z" }),
    ];

    const result = buildTaskMarkersByDate(tasks, stages, "2026-08-01");

    expect(result.get("2026-08-05")?.[0]?.stage).toBe("実装");
  });

  it("uses a null stage when developmentStageId is unset", () => {
    const tasks = [
      makeTask({ id: "t1", developmentStageId: null, scheduledDate: "2026-08-05T00:00:00.000Z" }),
    ];

    const result = buildTaskMarkersByDate(tasks, stages, "2026-08-01");

    expect(result.get("2026-08-05")?.[0]?.stage).toBeNull();
  });

  it("flags isOverdue when scheduledDate is before today and status is not done", () => {
    const tasks = [
      makeTask({ id: "t1", status: "in_progress", scheduledDate: "2026-08-01T00:00:00.000Z" }),
    ];

    const result = buildTaskMarkersByDate(tasks, stages, "2026-08-05");

    expect(result.get("2026-08-01")?.[0]?.isOverdue).toBe(true);
  });

  it("does not flag isOverdue when status is done, even if scheduledDate is in the past", () => {
    const tasks = [makeTask({ id: "t1", status: "done", scheduledDate: "2026-08-01T00:00:00.000Z" })];

    const result = buildTaskMarkersByDate(tasks, stages, "2026-08-05");

    expect(result.get("2026-08-01")?.[0]?.isOverdue).toBe(false);
  });

  it("does not flag isOverdue when scheduledDate is today or in the future", () => {
    const tasks = [
      makeTask({ id: "t1", status: "not_started", scheduledDate: "2026-08-05T00:00:00.000Z" }),
      makeTask({ id: "t2", status: "not_started", scheduledDate: "2026-08-06T00:00:00.000Z" }),
    ];

    const result = buildTaskMarkersByDate(tasks, stages, "2026-08-05");

    expect(result.get("2026-08-05")?.[0]?.isOverdue).toBe(false);
    expect(result.get("2026-08-06")?.[0]?.isOverdue).toBe(false);
  });
});

describe("truncateDayMarkers (task 7.2, Requirement 2.5)", () => {
  function makeMarker(taskId: string) {
    return { taskId, title: `Task ${taskId}`, stage: null, isOverdue: false };
  }

  it("returns all markers with zero overflow when under maxVisible", () => {
    const markers = [makeMarker("t1"), makeMarker("t2")];
    expect(truncateDayMarkers(markers, 3)).toEqual({ visible: markers, overflowCount: 0 });
  });

  it("returns all markers with zero overflow when exactly at maxVisible", () => {
    const markers = [makeMarker("t1"), makeMarker("t2"), makeMarker("t3")];
    expect(truncateDayMarkers(markers, 3)).toEqual({ visible: markers, overflowCount: 0 });
  });

  it("truncates to the top maxVisible and reports the overflow count when over the threshold", () => {
    const markers = [makeMarker("t1"), makeMarker("t2"), makeMarker("t3"), makeMarker("t4"), makeMarker("t5")];
    const result = truncateDayMarkers(markers, 2);
    expect(result.visible).toEqual([makeMarker("t1"), makeMarker("t2")]);
    expect(result.overflowCount).toBe(3);
  });

  it("returns an empty visible list with zero overflow for an empty input", () => {
    expect(truncateDayMarkers([], 3)).toEqual({ visible: [], overflowCount: 0 });
  });

  it("respects a maxVisible different from the old fixed constant of 3", () => {
    const markers = [makeMarker("t1"), makeMarker("t2")];
    expect(truncateDayMarkers(markers, 1)).toEqual({ visible: [makeMarker("t1")], overflowCount: 1 });
  });
});

describe("shiftMonth (task 7.2, Requirement 4.1, 4.2, 4.3)", () => {
  it("moves forward one month within the same year", () => {
    expect(shiftMonth(2026, 8, 1)).toEqual({ year: 2026, month: 9 });
  });

  it("moves backward one month within the same year", () => {
    expect(shiftMonth(2026, 8, -1)).toEqual({ year: 2026, month: 7 });
  });

  it("rolls over from December to next January when moving forward", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("rolls over from January to previous December when moving backward", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("returns the same year/month when delta is zero", () => {
    expect(shiftMonth(2026, 8, 0)).toEqual({ year: 2026, month: 8 });
  });
});

describe("colorIndexForCase (task 7.2)", () => {
  it("returns a value in the 0-5 range", () => {
    for (const id of ["case-1", "case-2", "abc", "z", "", "a-very-long-case-id-string-1234567890"]) {
      const index = colorIndexForCase(id);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(5);
    }
  });

  it("returns the same value for the same caseId across multiple calls (stable)", () => {
    const a = colorIndexForCase("case-abc-123");
    const b = colorIndexForCase("case-abc-123");
    expect(a).toBe(b);
  });

  it("is deterministic across process-independent computation (not Math.random)", () => {
    const values = Array.from({ length: 5 }, () => colorIndexForCase("stable-id"));
    expect(new Set(values).size).toBe(1);
  });
});

describe("computeWeekRowBudget (task 7.2)", () => {
  it("always sums bandRows + maxTasks to totalRows across lane counts and overflow states", () => {
    for (let laneCount = 0; laneCount <= 3; laneCount += 1) {
      for (const hasOverflow of [true, false]) {
        const budget = computeWeekRowBudget(laneCount, hasOverflow, 7, 3);
        expect(budget.bandRows + budget.maxTasks).toBe(7);
      }
    }
  });

  it("caps bandRows at maxLanes even when laneCount + overflow would exceed it", () => {
    const budget = computeWeekRowBudget(3, true, 7, 3);
    expect(budget.bandRows).toBe(3);
    expect(budget.maxTasks).toBe(4);
  });

  it("computes bandRows as laneCount without the overflow row when there is no overflow", () => {
    const budget = computeWeekRowBudget(2, false, 7, 3);
    expect(budget.bandRows).toBe(2);
    expect(budget.maxTasks).toBe(5);
  });

  it("computes bandRows as laneCount + 1 for the overflow chip row when under maxLanes", () => {
    const budget = computeWeekRowBudget(1, true, 7, 3);
    expect(budget.bandRows).toBe(2);
    expect(budget.maxTasks).toBe(5);
  });

  it("returns bandRows 0 and maxTasks == totalRows when there are no lanes and no overflow", () => {
    const budget = computeWeekRowBudget(0, false, 7, 3);
    expect(budget.bandRows).toBe(0);
    expect(budget.maxTasks).toBe(7);
  });
});

describe("buildWeekCaseLanes (task 7.2, Requirement 3.1-3.6)", () => {
  it("excludes a case with neither startDate nor endDate set", () => {
    const cases = [makeCase({ id: "c1", startDate: null, endDate: null })];
    const result = buildWeekCaseLanes(WEEK, cases, 3);
    expect(result.lanes.flat()).toEqual([]);
    expect(result.overflow).toEqual([]);
  });

  it("packs two non-overlapping cases into the same lane", () => {
    const cases = [
      makeCase({ id: "c1", startDate: "2026-08-02T00:00:00.000Z", endDate: "2026-08-03T00:00:00.000Z" }),
      makeCase({ id: "c2", startDate: "2026-08-05T00:00:00.000Z", endDate: "2026-08-06T00:00:00.000Z" }),
    ];

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    expect(result.lanes.length).toBe(1);
    expect(result.lanes[0]?.map((item) => item.caseId)).toEqual(["c1", "c2"]);
    expect(result.overflow).toEqual([]);
  });

  it("places overlapping cases into different lanes", () => {
    const cases = [
      makeCase({ id: "c1", startDate: "2026-08-02T00:00:00.000Z", endDate: "2026-08-05T00:00:00.000Z" }),
      makeCase({ id: "c2", startDate: "2026-08-03T00:00:00.000Z", endDate: "2026-08-06T00:00:00.000Z" }),
    ];

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    // c1 has the longer duration (4 days vs 3 days) so it sorts first and
    // claims lane 0; c2 overlaps it and must go to lane 1.
    expect(result.lanes.length).toBe(2);
    expect(result.lanes[0]?.map((item) => item.caseId)).toEqual(["c1"]);
    expect(result.lanes[1]?.map((item) => item.caseId)).toEqual(["c2"]);
    expect(result.overflow).toEqual([]);
  });

  it("sends cases beyond maxLanes to overflow, prioritized by open-ended-first then duration then start date", () => {
    // 4 mutually-overlapping cases (all span the whole week) with maxLanes=3:
    // one is open-ended (no endDate) so it must win a lane over all closed
    // cases regardless of duration.
    const cases = [
      makeCase({ id: "closed-short", startDate: "2026-08-02T00:00:00.000Z", endDate: "2026-08-03T00:00:00.000Z" }),
      makeCase({ id: "closed-long", startDate: "2026-08-02T00:00:00.000Z", endDate: "2026-08-08T00:00:00.000Z" }),
      makeCase({ id: "closed-mid", startDate: "2026-08-02T00:00:00.000Z", endDate: "2026-08-05T00:00:00.000Z" }),
      makeCase({ id: "open-ended", startDate: "2026-08-02T00:00:00.000Z", endDate: null }),
    ];

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    const allLaneIds = result.lanes.flat().map((item) => item.caseId);
    // open-ended-first, then longest duration, then earliest start:
    // open-ended, closed-long, closed-mid get lanes; closed-short overflows.
    expect(allLaneIds).toEqual(["open-ended", "closed-long", "closed-mid"]);
    expect(result.overflow.map((item) => item.caseId)).toEqual(["closed-short"]);
  });

  it("flags openStart/openEnd true when the case's date is literally unset on that side", () => {
    const cases = [makeCase({ id: "c1", startDate: "2026-08-05T00:00:00.000Z", endDate: null })];

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    const item = result.lanes.flat().find((i) => i.caseId === "c1");
    expect(item).toBeDefined();
    expect(item?.openStart).toBe(false);
    expect(item?.openEnd).toBe(true);
    expect(item?.startDayIndex).toBe(3); // 2026-08-05 is index 3 in WEEK
    expect(item?.endDayIndex).toBe(6); // clipped to the week's last column
  });

  it("flags openStart true and clips startDayIndex to 0 when the range extends before the week boundary", () => {
    const cases = [
      makeCase({ id: "c1", startDate: "2026-07-20T00:00:00.000Z", endDate: "2026-08-04T00:00:00.000Z" }),
    ];

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    const item = result.lanes.flat().find((i) => i.caseId === "c1");
    expect(item?.openStart).toBe(true);
    expect(item?.openEnd).toBe(false);
    expect(item?.startDayIndex).toBe(0);
    expect(item?.endDayIndex).toBe(2); // 2026-08-04 is index 2 in WEEK
  });

  it("flags openEnd true and clips endDayIndex to 6 when the range extends past the week boundary", () => {
    const cases = [
      makeCase({ id: "c1", startDate: "2026-08-06T00:00:00.000Z", endDate: "2026-09-20T00:00:00.000Z" }),
    ];

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    const item = result.lanes.flat().find((i) => i.caseId === "c1");
    expect(item?.openStart).toBe(false);
    expect(item?.openEnd).toBe(true);
    expect(item?.startDayIndex).toBe(4); // 2026-08-06 is index 4 in WEEK
    expect(item?.endDayIndex).toBe(6);
  });

  it("excludes a case entirely from this week when its range does not overlap the week at all", () => {
    const cases = [
      makeCase({ id: "c1", startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-10T00:00:00.000Z" }),
    ];

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    expect(result.lanes.flat()).toEqual([]);
    expect(result.overflow).toEqual([]);
  });

  it("carries isCompleted through onto the lane item", () => {
    const cases = [
      makeCase({ id: "c1", startDate: "2026-08-02T00:00:00.000Z", endDate: "2026-08-03T00:00:00.000Z", isCompleted: true }),
    ];

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    expect(result.lanes.flat()[0]?.isCompleted).toBe(true);
  });

  it("assigns colorIndex matching colorIndexForCase for the same caseId", () => {
    const cases = [
      makeCase({ id: "c1", startDate: "2026-08-02T00:00:00.000Z", endDate: "2026-08-03T00:00:00.000Z" }),
    ];

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    expect(result.lanes.flat()[0]?.colorIndex).toBe(colorIndexForCase("c1"));
  });

  it("never exceeds maxLanes lanes", () => {
    const cases = Array.from({ length: 6 }, (_, i) =>
      makeCase({ id: `c${i}`, startDate: "2026-08-02T00:00:00.000Z", endDate: "2026-08-08T00:00:00.000Z" }),
    );

    const result = buildWeekCaseLanes(WEEK, cases, 3);

    expect(result.lanes.length).toBeLessThanOrEqual(3);
    expect(result.lanes.flat().length + result.overflow.length).toBe(6);
  });
});

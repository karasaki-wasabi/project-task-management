import { describe, expect, it } from "vitest";
import type { DateCell } from "~/components/shared/DatePicker.helpers";
import { buildCaseSegments, buildTaskMarkersByDate, shiftMonth, truncateDayMarkers } from "./index.helpers";

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

// August 2026 has 5 Saturdays / Sundays, but we only need a handful of
// consecutive days for these tests: 2026-08-03 .. 2026-08-07 (Mon-Fri).
const AUGUST_CELLS: DateCell[] = [
  makeCell("2026-08-03"),
  makeCell("2026-08-04"),
  makeCell("2026-08-05"),
  makeCell("2026-08-06"),
  makeCell("2026-08-07"),
];

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

describe("buildTaskMarkersByDate (task 3.1, Requirement 2.1, 2.2)", () => {
  it("groups tasks with a scheduledDate by local-calendar-day date key", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Task 1", scheduledDate: "2026-08-05T00:00:00.000Z" }),
      makeTask({ id: "t2", title: "Task 2", scheduledDate: "2026-08-05T00:00:00.000Z" }),
      makeTask({ id: "t3", title: "Task 3", scheduledDate: "2026-08-06T00:00:00.000Z" }),
    ];

    const result = buildTaskMarkersByDate(tasks);

    expect(result.size).toBe(2);
    expect(result.get("2026-08-05")).toEqual([
      { taskId: "t1", title: "Task 1", status: "not_started", priority: "medium" },
      { taskId: "t2", title: "Task 2", status: "not_started", priority: "medium" },
    ]);
    expect(result.get("2026-08-06")).toEqual([
      { taskId: "t3", title: "Task 3", status: "not_started", priority: "medium" },
    ]);
  });

  it("excludes tasks without a scheduledDate", () => {
    const tasks = [
      makeTask({ id: "t1", scheduledDate: undefined }),
      makeTask({ id: "t2", scheduledDate: null }),
      makeTask({ id: "t3", scheduledDate: "2026-08-05T00:00:00.000Z" }),
    ];

    const result = buildTaskMarkersByDate(tasks);

    expect(result.size).toBe(1);
    expect(result.get("2026-08-05")?.map((marker) => marker.taskId)).toEqual(["t3"]);
  });

  it("returns an empty map when given no tasks", () => {
    expect(buildTaskMarkersByDate([]).size).toBe(0);
  });

  it("carries status and priority through onto the marker view", () => {
    const tasks = [
      makeTask({
        id: "t1",
        status: "in_progress",
        priority: "high",
        scheduledDate: "2026-08-05T00:00:00.000Z",
      }),
    ];

    const result = buildTaskMarkersByDate(tasks);

    expect(result.get("2026-08-05")?.[0]).toEqual({
      taskId: "t1",
      title: "task-t1",
      status: "in_progress",
      priority: "high",
    });
  });
});

describe("truncateDayMarkers (task 3.1, Requirement 2.5)", () => {
  function makeMarker(taskId: string) {
    return { taskId, title: `Task ${taskId}`, status: "not_started" as const, priority: "medium" as const };
  }

  it("returns all markers with zero overflow when under the threshold", () => {
    const markers = [makeMarker("t1"), makeMarker("t2")];
    expect(truncateDayMarkers(markers)).toEqual({ visible: markers, overflowCount: 0 });
  });

  it("returns all markers with zero overflow when exactly at the threshold", () => {
    const markers = [makeMarker("t1"), makeMarker("t2"), makeMarker("t3")];
    expect(truncateDayMarkers(markers)).toEqual({ visible: markers, overflowCount: 0 });
  });

  it("truncates to the top N and reports the overflow count when over the threshold", () => {
    const markers = [makeMarker("t1"), makeMarker("t2"), makeMarker("t3"), makeMarker("t4"), makeMarker("t5")];
    const result = truncateDayMarkers(markers);
    expect(result.visible).toEqual([makeMarker("t1"), makeMarker("t2"), makeMarker("t3")]);
    expect(result.overflowCount).toBe(2);
  });

  it("returns an empty visible list with zero overflow for an empty input", () => {
    expect(truncateDayMarkers([])).toEqual({ visible: [], overflowCount: 0 });
  });
});

describe("shiftMonth (task 3.1, Requirement 4.1, 4.2, 4.3)", () => {
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

describe("buildCaseSegments (task 3.2, Requirement 3.1, 3.2, 3.3, 3.4)", () => {
  it("segments a case with both startDate and endDate into start/middle/end", () => {
    const cases = [
      makeCase({ id: "c1", name: "Case 1", startDate: "2026-08-04T00:00:00.000Z", endDate: "2026-08-06T00:00:00.000Z" }),
    ];

    const result = buildCaseSegments(AUGUST_CELLS, cases);

    expect(result.get("2026-08-03")).toBeUndefined();
    expect(result.get("2026-08-04")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "start" }]);
    expect(result.get("2026-08-05")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "middle" }]);
    expect(result.get("2026-08-06")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "end" }]);
    expect(result.get("2026-08-07")).toBeUndefined();
  });

  it("marks a single-day case (startDate === endDate) as 'single', not both start and end", () => {
    const cases = [
      makeCase({ id: "c1", name: "Case 1", startDate: "2026-08-05T00:00:00.000Z", endDate: "2026-08-05T00:00:00.000Z" }),
    ];

    const result = buildCaseSegments(AUGUST_CELLS, cases);

    expect(result.get("2026-08-05")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "single" }]);
    expect(result.size).toBe(1);
  });

  it("marks the date as 'point' when only startDate is set", () => {
    const cases = [makeCase({ id: "c1", name: "Case 1", startDate: "2026-08-05T00:00:00.000Z", endDate: null })];

    const result = buildCaseSegments(AUGUST_CELLS, cases);

    expect(result.get("2026-08-05")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "point" }]);
    expect(result.size).toBe(1);
  });

  it("marks the date as 'point' when only endDate is set", () => {
    const cases = [makeCase({ id: "c1", name: "Case 1", startDate: null, endDate: "2026-08-06T00:00:00.000Z" })];

    const result = buildCaseSegments(AUGUST_CELLS, cases);

    expect(result.get("2026-08-06")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "point" }]);
    expect(result.size).toBe(1);
  });

  it("excludes a case with neither startDate nor endDate set", () => {
    const cases = [makeCase({ id: "c1", name: "Case 1", startDate: null, endDate: null })];

    const result = buildCaseSegments(AUGUST_CELLS, cases);

    expect(result.size).toBe(0);
  });

  it("carries isCompleted through onto the segment view", () => {
    const cases = [
      makeCase({ id: "c1", name: "Case 1", startDate: "2026-08-05T00:00:00.000Z", endDate: null, isCompleted: true }),
    ];

    const result = buildCaseSegments(AUGUST_CELLS, cases);

    expect(result.get("2026-08-05")?.[0]).toEqual({ caseId: "c1", name: "Case 1", isCompleted: true, position: "point" });
  });

  it("only segments the portion of a case's range that overlaps the given cells (crosses in from before the grid)", () => {
    // Case starts well before the visible grid and ends inside it — only
    // the overlapping days (03..05) should appear, with 03 as the visible
    // grid's leading edge (not a fabricated 'start' since the true start is
    // outside `cells`).
    const cases = [
      makeCase({ id: "c1", name: "Case 1", startDate: "2026-07-20T00:00:00.000Z", endDate: "2026-08-05T00:00:00.000Z" }),
    ];

    const result = buildCaseSegments(AUGUST_CELLS, cases);

    expect(result.get("2026-08-03")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "middle" }]);
    expect(result.get("2026-08-04")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "middle" }]);
    expect(result.get("2026-08-05")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "end" }]);
    expect(result.get("2026-08-06")).toBeUndefined();
  });

  it("only segments the portion of a case's range that overlaps the given cells (extends out past the grid)", () => {
    // Case starts inside the visible grid and ends well after it — only
    // 05..07 should appear, with 07 as the visible grid's trailing edge.
    const cases = [
      makeCase({ id: "c1", name: "Case 1", startDate: "2026-08-05T00:00:00.000Z", endDate: "2026-09-20T00:00:00.000Z" }),
    ];

    const result = buildCaseSegments(AUGUST_CELLS, cases);

    expect(result.get("2026-08-04")).toBeUndefined();
    expect(result.get("2026-08-05")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "start" }]);
    expect(result.get("2026-08-06")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "middle" }]);
    expect(result.get("2026-08-07")).toEqual([{ caseId: "c1", name: "Case 1", isCompleted: false, position: "middle" }]);
  });
});

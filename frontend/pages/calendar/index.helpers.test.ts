import { describe, expect, it } from "vitest";
import { buildTaskMarkersByDate, shiftMonth, truncateDayMarkers } from "./index.helpers";

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

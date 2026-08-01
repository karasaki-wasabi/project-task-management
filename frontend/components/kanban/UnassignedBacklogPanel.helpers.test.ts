import { describe, expect, it } from "vitest";
import { filterTasksByTitle, sortTasks } from "./UnassignedBacklogPanel.helpers";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "task",
    status: "not_started",
    priority: "medium",
    isRequiredForDelivery: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterTasksByTitle (task 2.3, Requirement 3.4)", () => {
  it("returns all tasks when the query is empty", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" }), makeTask({ id: "b", title: "Beta" })];
    expect(filterTasksByTitle(tasks, "")).toEqual(tasks);
  });

  it("returns all tasks when the query is whitespace-only", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" })];
    expect(filterTasksByTitle(tasks, "   ")).toEqual(tasks);
  });

  it("returns tasks whose title contains the query as a substring", () => {
    const tasks = [
      makeTask({ id: "a", title: "Fix login bug" }),
      makeTask({ id: "b", title: "Write docs" }),
    ];
    expect(filterTasksByTitle(tasks, "login")).toEqual([tasks[0]]);
  });

  it("matches case-insensitively", () => {
    const tasks = [makeTask({ id: "a", title: "Fix Login Bug" })];
    expect(filterTasksByTitle(tasks, "LOGIN")).toEqual(tasks);
  });

  it("returns an empty array when nothing matches", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" })];
    expect(filterTasksByTitle(tasks, "zzz")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" })];
    const result = filterTasksByTitle(tasks, "alpha");
    expect(result).not.toBe(tasks);
  });
});

describe("sortTasks (task 2.3, Requirement 3.5)", () => {
  it("sorts by priority high -> medium -> low", () => {
    const low = makeTask({ id: "low", priority: "low" });
    const high = makeTask({ id: "high", priority: "high" });
    const medium = makeTask({ id: "medium", priority: "medium" });
    const result = sortTasks([low, high, medium], "priority");
    expect(result.map((t) => t.id)).toEqual(["high", "medium", "low"]);
  });

  it("preserves relative order for tied priorities (stable sort)", () => {
    const a = makeTask({ id: "a", priority: "high" });
    const b = makeTask({ id: "b", priority: "high" });
    const c = makeTask({ id: "c", priority: "high" });
    const result = sortTasks([a, b, c], "priority");
    expect(result.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by createdAt newest-first (descending)", () => {
    const older = makeTask({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeTask({ id: "newer", createdAt: "2026-06-01T00:00:00.000Z" });
    const result = sortTasks([older, newer], "createdAt");
    expect(result.map((t) => t.id)).toEqual(["newer", "older"]);
  });

  it("preserves relative order for tied createdAt (stable sort)", () => {
    const a = makeTask({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = makeTask({ id: "b", createdAt: "2026-01-01T00:00:00.000Z" });
    const result = sortTasks([a, b], "createdAt");
    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const tasks = [makeTask({ id: "a", priority: "low" }), makeTask({ id: "b", priority: "high" })];
    const original = [...tasks];
    sortTasks(tasks, "priority");
    expect(tasks).toEqual(original);
  });

  it("returns a new array reference", () => {
    const tasks = [makeTask({ id: "a" })];
    const result = sortTasks(tasks, "priority");
    expect(result).not.toBe(tasks);
  });
});

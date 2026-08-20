import { describe, expect, it } from "vitest";
import { filterTasksByTitle, sortTasks } from "./UnassignedBacklogPanel.helpers";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "task",
    status: "not_started",
    priority: "medium",
    isRequiredForCase: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterTasksByTitle (task 2.3, Requirement 3.4)", () => {
  it("クエリが空の場合、すべてのタスクを返す", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" }), makeTask({ id: "b", title: "Beta" })];
    expect(filterTasksByTitle(tasks, "")).toEqual(tasks);
  });

  it("クエリが空白の場合、すべてのタスクを返す", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" })];
    expect(filterTasksByTitle(tasks, "   ")).toEqual(tasks);
  });

  it("タイトルにクエリが部分文字列として含まれるタスクを返す", () => {
    const tasks = [
      makeTask({ id: "a", title: "Fix login bug" }),
      makeTask({ id: "b", title: "Write docs" }),
    ];
    expect(filterTasksByTitle(tasks, "login")).toEqual([tasks[0]]);
  });

  it("大文字小文字を区別しない", () => {
    const tasks = [makeTask({ id: "a", title: "Fix Login Bug" })];
    expect(filterTasksByTitle(tasks, "LOGIN")).toEqual(tasks);
  });

  it("何も一致しない場合、空の配列を返す", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" })];
    expect(filterTasksByTitle(tasks, "zzz")).toEqual([]);
  });

  it("入力配列を変更しない", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" })];
    const result = filterTasksByTitle(tasks, "alpha");
    expect(result).not.toBe(tasks);
  });
});

describe("sortTasks (task 2.3, Requirement 3.5)", () => {
  it("優先度高 -> 中 -> 低の順でソートする", () => {
    const low = makeTask({ id: "low", priority: "low" });
    const high = makeTask({ id: "high", priority: "high" });
    const medium = makeTask({ id: "medium", priority: "medium" });
    const result = sortTasks([low, high, medium], "priority");
    expect(result.map((t) => t.id)).toEqual(["high", "medium", "low"]);
  });

  it("優先度が同じ場合、相対的な順序を保持する（安定ソート）", () => {
    const a = makeTask({ id: "a", priority: "high" });
    const b = makeTask({ id: "b", priority: "high" });
    const c = makeTask({ id: "c", priority: "high" });
    const result = sortTasks([a, b, c], "priority");
    expect(result.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("createdAt が新しい順（降順）でソートする", () => {
    const older = makeTask({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeTask({ id: "newer", createdAt: "2026-06-01T00:00:00.000Z" });
    const result = sortTasks([older, newer], "createdAt");
    expect(result.map((t) => t.id)).toEqual(["newer", "older"]);
  });

  it("createdAt が同じ場合、相対的な順序を保持する（安定ソート）", () => {
    const a = makeTask({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = makeTask({ id: "b", createdAt: "2026-01-01T00:00:00.000Z" });
    const result = sortTasks([a, b], "createdAt");
    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("入力配列を変更しない", () => {
    const tasks = [makeTask({ id: "a", priority: "low" }), makeTask({ id: "b", priority: "high" })];
    const original = [...tasks];
    sortTasks(tasks, "priority");
    expect(tasks).toEqual(original);
  });

  it("新しい配列の参照を返す", () => {
    const tasks = [makeTask({ id: "a" })];
    const result = sortTasks(tasks, "priority");
    expect(result).not.toBe(tasks);
  });
});

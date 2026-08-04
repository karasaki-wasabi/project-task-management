import { describe, expect, it } from "vitest";
import {
  buildTaskAssociationCalls,
  filterTasksByTitle,
  initSelectionState,
  isAllSelected,
  selectAll,
  setRequired,
  setSelected,
  validateCaseForm,
} from "./CaseFormModal.helpers";

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

describe("initSelectionState (Requirement 3.1)", () => {
  it("starts every task unselected with required=false", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    expect(initSelectionState(tasks)).toEqual({
      a: { selected: false, isRequiredForCase: false },
      b: { selected: false, isRequiredForCase: false },
    });
  });

  it("returns an empty state for an empty task list (Requirement 3.6)", () => {
    expect(initSelectionState([])).toEqual({});
  });
});

describe("setSelected (Requirement 3.2/3.7)", () => {
  it("selects a previously-unselected task", () => {
    const state = initSelectionState([makeTask({ id: "a" })]);
    const next = setSelected(state, "a", true);
    expect(next.a).toEqual({ selected: true, isRequiredForCase: false });
  });

  it("does not mutate the input state", () => {
    const state = initSelectionState([makeTask({ id: "a" })]);
    setSelected(state, "a", true);
    expect(state.a).toEqual({ selected: false, isRequiredForCase: false });
  });

  it("resets isRequiredForCase to false when deselecting a required task (Requirement 3.3 invariant)", () => {
    let state = initSelectionState([makeTask({ id: "a" })]);
    state = setSelected(state, "a", true);
    state = setRequired(state, "a", true);
    expect(state.a).toEqual({ selected: true, isRequiredForCase: true });

    state = setSelected(state, "a", false);
    expect(state.a).toEqual({ selected: false, isRequiredForCase: false });
  });
});

describe("setRequired (Requirement 3.3/3.4) — the required toggle is only meaningful for selected tasks", () => {
  it("sets isRequiredForCase when the task is selected", () => {
    let state = initSelectionState([makeTask({ id: "a" })]);
    state = setSelected(state, "a", true);
    state = setRequired(state, "a", true);
    expect(state.a!.isRequiredForCase).toBe(true);
  });

  it("is a no-op when the task is not selected", () => {
    const state = initSelectionState([makeTask({ id: "a" })]);
    const next = setRequired(state, "a", true);
    expect(next).toEqual(state);
    expect(next.a!.isRequiredForCase).toBe(false);
  });

  it("is a no-op for an unknown task id", () => {
    const state = initSelectionState([makeTask({ id: "a" })]);
    const next = setRequired(state, "unknown", true);
    expect(next).toBe(state);
  });
});

describe("selectAll (すべて選択/解除)", () => {
  it("selects every given task id", () => {
    const state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" }), makeTask({ id: "c" })]);
    const next = selectAll(state, ["a", "b"], true);
    expect(next.a!.selected).toBe(true);
    expect(next.b!.selected).toBe(true);
    expect(next.c!.selected).toBe(false);
  });

  it("deselects and resets required flags for the given ids", () => {
    let state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    state = selectAll(state, ["a", "b"], true);
    state = setRequired(state, "a", true);
    state = selectAll(state, ["a", "b"], false);
    expect(state.a).toEqual({ selected: false, isRequiredForCase: false });
    expect(state.b).toEqual({ selected: false, isRequiredForCase: false });
  });
});

describe("isAllSelected", () => {
  it("is true only when every given id is selected", () => {
    let state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    expect(isAllSelected(state, ["a", "b"])).toBe(false);
    state = selectAll(state, ["a", "b"], true);
    expect(isAllSelected(state, ["a", "b"])).toBe(true);
  });

  it("is false for an empty id list", () => {
    expect(isAllSelected({}, [])).toBe(false);
  });
});

describe("buildTaskAssociationCalls (Requirement 3.2/3.5/3.7)", () => {
  it("returns an empty array when nothing is selected (0-selection is valid)", () => {
    const state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    expect(buildTaskAssociationCalls(state)).toEqual([]);
  });

  it("includes only selected tasks, each with its own required flag", () => {
    let state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" }), makeTask({ id: "c" })]);
    state = setSelected(state, "a", true);
    state = setRequired(state, "a", true);
    state = setSelected(state, "b", true);
    // "c" stays unselected.
    expect(buildTaskAssociationCalls(state)).toEqual([
      { taskId: "a", isRequiredForCase: true },
      { taskId: "b", isRequiredForCase: false },
    ]);
  });
});

describe("filterTasksByTitle (Requirement 3.1 list + search box)", () => {
  it("returns all tasks when the query is empty", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" }), makeTask({ id: "b", title: "Beta" })];
    expect(filterTasksByTitle(tasks, "")).toEqual(tasks);
  });

  it("matches case-insensitively as a substring", () => {
    const tasks = [makeTask({ id: "a", title: "Fix Login Bug" }), makeTask({ id: "b", title: "Write docs" })];
    expect(filterTasksByTitle(tasks, "login")).toEqual([tasks[0]]);
  });

  it("does not mutate the input array", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" })];
    const result = filterTasksByTitle(tasks, "alpha");
    expect(result).not.toBe(tasks);
  });
});

describe("validateCaseForm (Requirement 2.3/2.4)", () => {
  it("rejects an empty name", () => {
    const result = validateCaseForm({ name: "  ", startDate: "", endDate: "2026-08-10" });
    expect(result).toEqual({ valid: false, error: "案件名を入力してください" });
  });

  it("rejects a missing endDate", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "", endDate: "" });
    expect(result).toEqual({ valid: false, error: "終了日を入力してください" });
  });

  it("rejects startDate after endDate", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "2026-08-20", endDate: "2026-08-10" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("accepts startDate equal to endDate", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "2026-08-10", endDate: "2026-08-10" });
    expect(result).toEqual({ valid: true });
  });

  it("accepts a missing (optional) startDate", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "", endDate: "2026-08-10" });
    expect(result).toEqual({ valid: true });
  });

  it("accepts a fully valid form", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "2026-08-01", endDate: "2026-08-10" });
    expect(result).toEqual({ valid: true });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildCreateCaseInput,
  buildTaskAssociationCalls,
  filterTasksByTitle,
  initSelectionState,
  isAllSelected,
  resolveMissingDates,
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
  it("すべてのタスクを未選択で開始し、required=false", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    expect(initSelectionState(tasks)).toEqual({
      a: { selected: false, isRequiredForCase: false },
      b: { selected: false, isRequiredForCase: false },
    });
  });

  it("空のタスクリストの場合、空の状態を返す（Requirement 3.6）", () => {
    expect(initSelectionState([])).toEqual({});
  });
});

describe("setSelected (Requirement 3.2/3.7)", () => {
  it("以前に未選択だったタスクを選択する", () => {
    const state = initSelectionState([makeTask({ id: "a" })]);
    const next = setSelected(state, "a", true);
    expect(next.a).toEqual({ selected: true, isRequiredForCase: false });
  });

  it("入力状態を変更しない", () => {
    const state = initSelectionState([makeTask({ id: "a" })]);
    setSelected(state, "a", true);
    expect(state.a).toEqual({ selected: false, isRequiredForCase: false });
  });

  it("必要なタスクをデセレクトするとき、isRequiredForCase を false にリセットする（Requirement 3.3 不変）", () => {
    let state = initSelectionState([makeTask({ id: "a" })]);
    state = setSelected(state, "a", true);
    state = setRequired(state, "a", true);
    expect(state.a).toEqual({ selected: true, isRequiredForCase: true });

    state = setSelected(state, "a", false);
    expect(state.a).toEqual({ selected: false, isRequiredForCase: false });
  });
});

describe("setRequired (Requirement 3.3/3.4) — the required toggle is only meaningful for selected tasks", () => {
  it("タスクが選択されたとき、isRequiredForCase を設定する", () => {
    let state = initSelectionState([makeTask({ id: "a" })]);
    state = setSelected(state, "a", true);
    state = setRequired(state, "a", true);
    expect(state.a!.isRequiredForCase).toBe(true);
  });

  it("タスクが選択されていない場合、何もしない", () => {
    const state = initSelectionState([makeTask({ id: "a" })]);
    const next = setRequired(state, "a", true);
    expect(next).toEqual(state);
    expect(next.a!.isRequiredForCase).toBe(false);
  });

  it("不明なタスクIDの場合、何もしない", () => {
    const state = initSelectionState([makeTask({ id: "a" })]);
    const next = setRequired(state, "unknown", true);
    expect(next).toBe(state);
  });
});

describe("selectAll (すべて選択/解除)", () => {
  it("すべての指定されたタスクIDを選択する", () => {
    const state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" }), makeTask({ id: "c" })]);
    const next = selectAll(state, ["a", "b"], true);
    expect(next.a!.selected).toBe(true);
    expect(next.b!.selected).toBe(true);
    expect(next.c!.selected).toBe(false);
  });

  it("指定されたIDを未選択とし、必要なフラグをリセットする", () => {
    let state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    state = selectAll(state, ["a", "b"], true);
    state = setRequired(state, "a", true);
    state = selectAll(state, ["a", "b"], false);
    expect(state.a).toEqual({ selected: false, isRequiredForCase: false });
    expect(state.b).toEqual({ selected: false, isRequiredForCase: false });
  });
});

describe("isAllSelected", () => {
  it("すべての指定されたIDが選択されている場合、true を返す", () => {
    let state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    expect(isAllSelected(state, ["a", "b"])).toBe(false);
    state = selectAll(state, ["a", "b"], true);
    expect(isAllSelected(state, ["a", "b"])).toBe(true);
  });

  it("空のIDリストの場合、false を返す", () => {
    expect(isAllSelected({}, [])).toBe(false);
  });
});

describe("buildTaskAssociationCalls (Requirement 3.2/3.5/3.7)", () => {
  it("選択されていない場合、空の配列を返す（0-selectionは有効）", () => {
    const state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    expect(buildTaskAssociationCalls(state)).toEqual([]);
  });

  it("選択されたタスクのみを含み、各タスクにそれぞれの必要なフラグを含む", () => {
    let state = initSelectionState([makeTask({ id: "a" }), makeTask({ id: "b" }), makeTask({ id: "c" })]);
    state = setSelected(state, "a", true);
    state = setRequired(state, "a", true);
    state = setSelected(state, "b", true);
    // "c" は未選択のまま。
    expect(buildTaskAssociationCalls(state)).toEqual([
      { taskId: "a", isRequiredForCase: true },
      { taskId: "b", isRequiredForCase: false },
    ]);
  });
});

describe("filterTasksByTitle (Requirement 3.1 list + search box)", () => {
  it("クエリが空の場合、すべてのタスクを返す", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" }), makeTask({ id: "b", title: "Beta" })];
    expect(filterTasksByTitle(tasks, "")).toEqual(tasks);
  });

  it("部分一致で大文字小文字を区別しない", () => {
    const tasks = [makeTask({ id: "a", title: "Fix Login Bug" }), makeTask({ id: "b", title: "Write docs" })];
    expect(filterTasksByTitle(tasks, "login")).toEqual([tasks[0]]);
  });

  it("入力配列を変更しない", () => {
    const tasks = [makeTask({ id: "a", title: "Alpha" })];
    const result = filterTasksByTitle(tasks, "alpha");
    expect(result).not.toBe(tasks);
  });
});

describe("resolveMissingDates (Requirements 3.1, 3.5, 3.6)", () => {
  it("開始日と終了日が設定されている場合、null を返す（画面Aをスキップ）", () => {
    expect(resolveMissingDates("2026-08-01", "2026-08-10")).toBeNull();
  });

  it("開始日が未設定の場合、start を返す", () => {
    expect(resolveMissingDates("", "2026-08-10")).toBe("start");
  });

  it("終了日が未設定の場合、end を返す", () => {
    expect(resolveMissingDates("2026-08-01", "")).toBe("end");
  });

  it("開始日と終了日が未設定の場合、both を返す", () => {
    expect(resolveMissingDates("", "")).toBe("both");
  });

  it("空白のみの場合、未設定として扱う", () => {
    expect(resolveMissingDates("  ", "2026-08-10")).toBe("start");
  });
});

describe("buildCreateCaseInput (Requirements 3.2–3.4, 3.6 — omit templateOperations)", () => {
  it("templateOperations を省略して、サーバーが完全な候補を適用する", () => {
    const input = buildCreateCaseInput({
      name: " 案件A ",
      startDate: "2026-08-01",
      endDate: "2026-08-10",
    });
    expect(input).toEqual({
      name: "案件A",
      startDate: "2026-08-01",
      endDate: "2026-08-10",
    });
    expect(input).not.toHaveProperty("templateOperations");
  });

  it("空の日付を省略する（部分 / 両方未設定）", () => {
    expect(
      buildCreateCaseInput({ name: "案件A", startDate: "2026-08-01", endDate: "" }),
    ).toEqual({ name: "案件A", startDate: "2026-08-01" });
    expect(buildCreateCaseInput({ name: "案件A", startDate: "", endDate: "" })).toEqual({
      name: "案件A",
    });
  });
});

describe("validateCaseForm (Requirement 2.3/2.4)", () => {
  it("案件名が空の場合、エラーを返す", () => {
    const result = validateCaseForm({ name: "  ", startDate: "", endDate: "2026-08-10" });
    expect(result).toEqual({ valid: false, error: "案件名を入力してください" });
  });

  it("開始日が設定されている場合、終了日が未設定の場合、エラーを返さない", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "2026-08-01", endDate: "" });
    expect(result).toEqual({ valid: true });
  });

  it("開始日と終了日が未設定の場合、エラーを返さない", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "", endDate: "" });
    expect(result).toEqual({ valid: true });
  });

  it("開始日が終了日より後の場合、エラーを返す", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "2026-08-20", endDate: "2026-08-10" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("開始日が終了日と等しい場合、エラーを返さない", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "2026-08-10", endDate: "2026-08-10" });
    expect(result).toEqual({ valid: true });
  });

  it("開始日が未設定の場合、エラーを返さない", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "", endDate: "2026-08-10" });
    expect(result).toEqual({ valid: true });
  });

  it("完全に有効なフォームを受け入れる", () => {
    const result = validateCaseForm({ name: "案件A", startDate: "2026-08-01", endDate: "2026-08-10" });
    expect(result).toEqual({ valid: true });
  });
});

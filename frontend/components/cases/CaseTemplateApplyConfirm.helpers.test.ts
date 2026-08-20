import { describe, expect, it } from "vitest";
import type { CaseTemplateApplyOperation } from "./caseTemplateApplyCandidates";
import {
  buildCandidateRows,
  buildDateChangeSummary,
  createMissingBody,
  formatDateSummary,
  hasDestructiveOperations,
  initConfirmState,
  reduceConfirm,
  selectedOperations,
  type ConfirmAction,
  type ConfirmState,
} from "./CaseTemplateApplyConfirm.helpers";

function apply(state: ConfirmState, ...actions: ConfirmAction[]): ConfirmState {
  return actions.reduce((s, a) => reduceConfirm(s, a), state);
}

describe("initConfirmState — screen entry (Requirements 3.1/3.5, 4.1)", () => {
  it("create-missing で画面Aを開く", () => {
    const state = initConfirmState({
      mode: "create-missing",
      missingDates: "both",
      candidates: [],
    });
    expect(state.screen).toBe("A");
    expect(state.outcome).toBeNull();
  });

  it("edit-apply で画面Bを開く（Requirement 4.2）", () => {
    const candidates: CaseTemplateApplyOperation[] = ["start_regenerate", "month_regenerate"];
    const state = initConfirmState({ mode: "edit-apply", candidates });
    expect(state.screen).toBe("B");
    expect(state.selection).toEqual({
      start_regenerate: true,
      month_regenerate: true,
    });
  });
});

describe("createMissingBody — 画面Aのコピー via missingDates（Requirement 3.5）", () => {
  it("開始日のみ未設定を説明する", () => {
    const body = createMissingBody("start");
    expect(body).toContain("開始日");
    expect(body).not.toContain("開始日および終了日");
  });

  it("終了日のみ未設定を説明する", () => {
    const body = createMissingBody("end");
    expect(body).toContain("終了日");
    expect(body).not.toContain("開始日および終了日");
  });

  it("開始日と終了日が未設定を説明する（Requirement 3.1）", () => {
    const body = createMissingBody("both");
    expect(body).toContain("開始日および終了日");
  });
});

describe("formatDateSummary — 未設定の日付に赤いフラグを使用する", () => {
  it("marks null/empty as unset", () => {
    expect(formatDateSummary(null)).toEqual({ text: "未設定", unset: true });
    expect(formatDateSummary("")).toEqual({ text: "未設定", unset: true });
  });

  it("YYYY-MM-DD の値を設定としてフォーマットする", () => {
    expect(formatDateSummary("2026-04-01")).toEqual({ text: "2026-04-01", unset: false });
  });
});

describe("buildDateChangeSummary — 日付が変更された場合のみ取り消し線を使用する", () => {
  it("変更されていない終了日を未変更としてマークする（同じカレンダー日）", () => {
    expect(
      buildDateChangeSummary("2036-06-15", "2036-06-15"),
    ).toMatchObject({ changed: false, newText: "2036-06-15" });
    expect(
      buildDateChangeSummary("2036-06-15T00:00:00.000Z", "2036-06-15"),
    ).toMatchObject({ changed: false });
  });

  it("開始日の変更を変更としてマークする", () => {
    expect(
      buildDateChangeSummary("2036-06-01", "2036-06-02"),
    ).toMatchObject({
      changed: true,
      oldText: "2036-06-01",
      newText: "2036-06-02",
    });
  });
});

describe("buildCandidateRows — タグ 追加/生成し直し/削除（Requirement 4.1）", () => {
  it("maps generate / regenerate / delete tags", () => {
    const rows = buildCandidateRows(["start_generate", "end_regenerate", "month_delete"]);
    expect(rows.map((r) => r.tag)).toEqual(["追加", "生成し直し", "削除"]);
    expect(rows.map((r) => r.operation)).toEqual([
      "start_generate",
      "end_regenerate",
      "month_delete",
    ]);
    for (const row of rows) {
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.note.length).toBeGreaterThan(0);
    }
  });
});

describe("画面フロー B → C → approve（Requirements 4.1–4.3）", () => {
  it("次へで B→C、戻るで C→B に移動する", () => {
    let state = initConfirmState({
      mode: "edit-apply",
      candidates: ["start_generate", "end_delete"],
    });
    state = apply(state, { type: "primary" });
    expect(state.screen).toBe("C");
    state = apply(state, { type: "secondary" });
    expect(state.screen).toBe("B");
    expect(state.outcome).toBeNull();
  });

  it("選択された操作のみを承認する（Requirement 4.3）", () => {
    let state = initConfirmState({
      mode: "edit-apply",
      candidates: ["start_generate", "end_delete", "month_generate"],
    });
    state = apply(state, { type: "toggle", operation: "end_delete" });
    expect(state.selection.end_delete).toBe(false);
    state = apply(state, { type: "primary" }, { type: "primary" });
    expect(state.outcome).toEqual({
      type: "approve",
      operations: ["start_generate", "month_generate"],
    });
  });

  it("日付のみの保存の場合、空の選択を承認する（Requirement 4.13 / 4.3）", () => {
    let state = initConfirmState({
      mode: "edit-apply",
      candidates: ["start_regenerate"],
    });
    state = apply(
      state,
      { type: "toggle", operation: "start_regenerate" },
      { type: "primary" },
      { type: "primary" },
    );
    expect(state.outcome).toEqual({ type: "approve", operations: [] });
  });
});

describe("画面A 承認 / 中止（Requirements 3.1, 3.5, 4.4）", () => {
  it("create-missing で null 操作を承認する（親が templateOperations を省略する）", () => {
    let state = initConfirmState({
      mode: "create-missing",
      missingDates: "start",
      candidates: [],
    });
    state = apply(state, { type: "primary" });
    expect(state.outcome).toEqual({ type: "approve", operations: null });
  });

  it("画面Aからセカンダリで中止する", () => {
    let state = initConfirmState({
      mode: "create-missing",
      missingDates: "both",
      candidates: [],
    });
    state = apply(state, { type: "secondary" });
    expect(state.outcome).toEqual({ type: "abort" });
  });

  it("画面Bからdismissで中止する（キャンセル / × / Esc / overlay）— Requirement 4.4", () => {
    let state = initConfirmState({
      mode: "edit-apply",
      candidates: ["start_generate"],
    });
    state = apply(state, { type: "dismiss" });
    expect(state.outcome).toEqual({ type: "abort" });
  });

  it("画面Cからdismissで中止する（承認なし）", () => {
    let state = initConfirmState({
      mode: "edit-apply",
      candidates: ["start_generate"],
    });
    state = apply(state, { type: "primary" }, { type: "dismiss" });
    expect(state.screen).toBe("C");
    expect(state.outcome).toEqual({ type: "abort" });
  });

  it("画面Bからセカンダリで中止する", () => {
    let state = initConfirmState({
      mode: "edit-apply",
      candidates: ["start_delete"],
    });
    state = apply(state, { type: "secondary" });
    expect(state.outcome).toEqual({ type: "abort" });
  });
});

describe("selectedOperations / hasDestructiveOperations （画面C）", () => {
  it("選択された操作の順序を保持する", () => {
    const candidates: CaseTemplateApplyOperation[] = [
      "start_generate",
      "end_regenerate",
      "month_delete",
    ];
    const selection = {
      start_generate: true,
      end_regenerate: false,
      month_delete: true,
    };
    expect(selectedOperations(candidates, selection)).toEqual(["start_generate", "month_delete"]);
  });

  it("削除と生成し直しを破壊的な操作として赤いバナーにフラグを立てる", () => {
    expect(hasDestructiveOperations(["start_generate"])).toBe(false);
    expect(hasDestructiveOperations(["start_delete"])).toBe(true);
    expect(hasDestructiveOperations(["month_regenerate"])).toBe(true);
  });
});

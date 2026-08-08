// CaseTemplateApplyConfirm pure-logic tests (task 6.1).
// Requirements 3.1/3.5, 4.1–4.4. Screen A/B/C flow + selection → approve.
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
  it("opens screen A for create-missing mode", () => {
    const state = initConfirmState({
      mode: "create-missing",
      missingDates: "both",
      candidates: [],
    });
    expect(state.screen).toBe("A");
    expect(state.outcome).toBeNull();
  });

  it("opens screen B for edit-apply with all candidates checked (Requirement 4.2)", () => {
    const candidates: CaseTemplateApplyOperation[] = ["start_regenerate", "month_regenerate"];
    const state = initConfirmState({ mode: "edit-apply", candidates });
    expect(state.screen).toBe("B");
    expect(state.selection).toEqual({
      start_regenerate: true,
      month_regenerate: true,
    });
  });
});

describe("createMissingBody — screen A copy via missingDates (Requirement 3.5)", () => {
  it("describes start-only missing", () => {
    const body = createMissingBody("start");
    expect(body).toContain("開始日");
    expect(body).not.toContain("開始日および終了日");
  });

  it("describes end-only missing", () => {
    const body = createMissingBody("end");
    expect(body).toContain("終了日");
    expect(body).not.toContain("開始日および終了日");
  });

  it("describes both missing (Requirement 3.1)", () => {
    const body = createMissingBody("both");
    expect(body).toContain("開始日および終了日");
  });
});

describe("formatDateSummary — unset dates use amber flag", () => {
  it("marks null/empty as unset", () => {
    expect(formatDateSummary(null)).toEqual({ text: "未設定", unset: true });
    expect(formatDateSummary("")).toEqual({ text: "未設定", unset: true });
  });

  it("formats a YYYY-MM-DD value as set", () => {
    expect(formatDateSummary("2026-04-01")).toEqual({ text: "2026-04-01", unset: false });
  });
});

describe("buildDateChangeSummary — strikethrough only when day changes", () => {
  it("marks unchanged end date as not changed (same calendar day)", () => {
    expect(
      buildDateChangeSummary("2036-06-15", "2036-06-15"),
    ).toMatchObject({ changed: false, newText: "2036-06-15" });
    expect(
      buildDateChangeSummary("2036-06-15T00:00:00.000Z", "2036-06-15"),
    ).toMatchObject({ changed: false });
  });

  it("marks start date change as changed", () => {
    expect(
      buildDateChangeSummary("2036-06-01", "2036-06-02"),
    ).toMatchObject({
      changed: true,
      oldText: "2036-06-01",
      newText: "2036-06-02",
    });
  });
});

describe("buildCandidateRows — tags 追加/生成し直し/削除 (Requirement 4.1)", () => {
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

describe("screen flow B → C → approve (Requirements 4.1–4.3)", () => {
  it("moves B→C on next, C→B on back", () => {
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

  it("approves with selected operations only (Requirement 4.3)", () => {
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

  it("approves empty selection for date-only save (Requirement 4.13 / 4.3)", () => {
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

describe("screen A approve / abort (Requirements 3.1, 3.5, 4.4)", () => {
  it("approves create-missing with null operations (parent omits templateOperations)", () => {
    let state = initConfirmState({
      mode: "create-missing",
      missingDates: "start",
      candidates: [],
    });
    state = apply(state, { type: "primary" });
    expect(state.outcome).toEqual({ type: "approve", operations: null });
  });

  it("aborts on secondary from A (戻る)", () => {
    let state = initConfirmState({
      mode: "create-missing",
      missingDates: "both",
      candidates: [],
    });
    state = apply(state, { type: "secondary" });
    expect(state.outcome).toEqual({ type: "abort" });
  });

  it("aborts on dismiss from B (キャンセル / × / Esc / overlay) — Requirement 4.4", () => {
    let state = initConfirmState({
      mode: "edit-apply",
      candidates: ["start_generate"],
    });
    state = apply(state, { type: "dismiss" });
    expect(state.outcome).toEqual({ type: "abort" });
  });

  it("aborts on dismiss from C without approving", () => {
    let state = initConfirmState({
      mode: "edit-apply",
      candidates: ["start_generate"],
    });
    state = apply(state, { type: "primary" }, { type: "dismiss" });
    expect(state.screen).toBe("C");
    expect(state.outcome).toEqual({ type: "abort" });
  });

  it("aborts on secondary from B (キャンセル)", () => {
    let state = initConfirmState({
      mode: "edit-apply",
      candidates: ["start_delete"],
    });
    state = apply(state, { type: "secondary" });
    expect(state.outcome).toEqual({ type: "abort" });
  });
});

describe("selectedOperations / hasDestructiveOperations (screen C)", () => {
  it("preserves candidate order when filtering selection", () => {
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

  it("flags delete and regenerate as destructive for amber banner", () => {
    expect(hasDestructiveOperations(["start_generate"])).toBe(false);
    expect(hasDestructiveOperations(["start_delete"])).toBe(true);
    expect(hasDestructiveOperations(["month_regenerate"])).toBe(true);
  });
});

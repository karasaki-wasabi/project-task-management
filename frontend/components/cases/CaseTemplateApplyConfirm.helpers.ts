// Pure logic for CaseTemplateApplyConfirm (task 6.1, design.md
// CaseTemplateApplyConfirm, research.md「ビジュアルデザイン確定: 案件テンプレート適用確認」).
// Extracted so screen A/B/C flow and selection → approve can be unit-tested
// Pure helpers for screen transitions; Vue mount coverage lives in CaseTemplateApplyConfirm.test.ts.

import type { CaseTemplateApplyOperation } from "./caseTemplateApplyCandidates";

export type MissingDates = "start" | "end" | "both";
export type ConfirmMode = "create-missing" | "edit-apply";
export type ConfirmScreen = "A" | "B" | "C";

export type CandidateTag = "追加" | "生成し直し" | "削除";
export type CandidateTagKind = "add" | "regen" | "del";

export interface CandidateRow {
  operation: CaseTemplateApplyOperation;
  tag: CandidateTag;
  tagKind: CandidateTagKind;
  title: string;
  note: string;
}

export type ConfirmOutcome =
  | { type: "approve"; operations: CaseTemplateApplyOperation[] | null }
  | { type: "abort" };

export interface ConfirmState {
  mode: ConfirmMode;
  screen: ConfirmScreen;
  candidates: CaseTemplateApplyOperation[];
  selection: Record<string, boolean>;
  outcome: ConfirmOutcome | null;
}

export type ConfirmAction =
  | { type: "primary" }
  | { type: "secondary" }
  | { type: "dismiss" }
  | { type: "toggle"; operation: CaseTemplateApplyOperation };

const CANDIDATE_META: Record<
  CaseTemplateApplyOperation,
  Omit<CandidateRow, "operation">
> = {
  start_generate: {
    tag: "追加",
    tagKind: "add",
    title: "案件開始日起点のタスクを追加",
    note: "有効な開始日起点テンプレートからタスクを生成します",
  },
  start_regenerate: {
    tag: "生成し直し",
    tagKind: "regen",
    title: "案件開始日起点のタスクを生成し直し",
    note: "既存の開始日起点タスクを削除し、有効テンプレートから再生成します",
  },
  start_delete: {
    tag: "削除",
    tagKind: "del",
    title: "案件開始日起点のタスクを削除",
    note: "開始日起点で生成済みのタスクを削除します（完了済みも含む）",
  },
  end_generate: {
    tag: "追加",
    tagKind: "add",
    title: "案件終了日起点のタスクを追加",
    note: "有効な終了日起点テンプレートからタスクを生成します",
  },
  end_regenerate: {
    tag: "生成し直し",
    tagKind: "regen",
    title: "案件終了日起点のタスクを生成し直し",
    note: "既存の終了日起点タスクを削除し、有効テンプレートから再生成します",
  },
  end_delete: {
    tag: "削除",
    tagKind: "del",
    title: "案件終了日起点のタスクを削除",
    note: "終了日起点で生成済みのタスクを削除します（完了済みも含む）",
  },
  month_generate: {
    tag: "追加",
    tagKind: "add",
    title: "各月初・各月末起点のタスクを追加",
    note: "期間内の各月初・各月末起点テンプレートからタスクを生成します",
  },
  month_regenerate: {
    tag: "生成し直し",
    tagKind: "regen",
    title: "各月初・各月末起点のタスクを生成し直し",
    note: "既存の月初・月末起点タスクを削除し、有効テンプレートから再生成します",
  },
  month_delete: {
    tag: "削除",
    tagKind: "del",
    title: "各月初・各月末起点のタスクを削除",
    note: "月初・月末起点で生成済みのタスクを削除します（完了済みも含む）",
  },
};

export function initConfirmState(input: {
  mode: ConfirmMode;
  missingDates?: MissingDates;
  candidates: CaseTemplateApplyOperation[];
}): ConfirmState {
  const selection: Record<string, boolean> = {};
  for (const op of input.candidates) {
    selection[op] = true;
  }
  return {
    mode: input.mode,
    screen: input.mode === "create-missing" ? "A" : "B",
    candidates: [...input.candidates],
    selection,
    outcome: null,
  };
}

/** Requirement 3.1 / 3.5 — body copy switches on missingDates. */
export function createMissingBody(missingDates: MissingDates): string {
  switch (missingDates) {
    case "start":
      return "開始日が未設定です。終了日起点のテンプレートタスクのみ追加されます。あとから開始日を設定すると、開始日起点のタスクを追加できます。";
    case "end":
      return "終了日が未設定です。開始日起点のテンプレートタスクのみ追加されます。あとから終了日を設定すると、終了日起点のタスクを追加・付け替えできます。";
    case "both":
      return "開始日および終了日が未設定です。テンプレートからのタスク追加は行いません。あとから日付を設定すると、テンプレートタスクを追加できます。";
  }
}

export function formatDateSummary(value: string | null | undefined): {
  text: string;
  unset: boolean;
} {
  if (value == null || value.trim() === "") {
    return { text: "未設定", unset: true };
  }
  return { text: value.trim().slice(0, 10), unset: false };
}

/** Screen B date row: strikethrough → new only when the calendar day actually changed. */
export type DateChangeSummary = {
  changed: boolean;
  oldText: string;
  newText: string;
  oldUnset: boolean;
  newUnset: boolean;
};

export function buildDateChangeSummary(
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
): DateChangeSummary {
  const oldSummary = formatDateSummary(oldValue);
  const newSummary = formatDateSummary(newValue);
  return {
    changed: oldSummary.text !== newSummary.text,
    oldText: oldSummary.text,
    newText: newSummary.text,
    oldUnset: oldSummary.unset,
    newUnset: newSummary.unset,
  };
}

export function buildCandidateRows(
  candidates: CaseTemplateApplyOperation[],
): CandidateRow[] {
  return candidates.map((operation) => ({
    operation,
    ...CANDIDATE_META[operation],
  }));
}

export function selectedOperations(
  candidates: CaseTemplateApplyOperation[],
  selection: Record<string, boolean>,
): CaseTemplateApplyOperation[] {
  return candidates.filter((op) => selection[op] === true);
}

export function hasDestructiveOperations(
  operations: CaseTemplateApplyOperation[],
): boolean {
  return operations.some(
    (op) => op.endsWith("_delete") || op.endsWith("_regenerate"),
  );
}

export function reduceConfirm(
  state: ConfirmState,
  action: ConfirmAction,
): ConfirmState {
  if (state.outcome !== null) return state;

  switch (action.type) {
    case "toggle": {
      if (state.screen !== "B") return state;
      if (!(action.operation in state.selection)) return state;
      return {
        ...state,
        selection: {
          ...state.selection,
          [action.operation]: !state.selection[action.operation],
        },
      };
    }
    case "dismiss":
      return { ...state, outcome: { type: "abort" } };
    case "secondary": {
      if (state.screen === "C") {
        return { ...state, screen: "B" };
      }
      // A 戻る / B キャンセル
      return { ...state, outcome: { type: "abort" } };
    }
    case "primary": {
      if (state.screen === "A") {
        // Parent omits templateOperations; server derives from dates.
        return { ...state, outcome: { type: "approve", operations: null } };
      }
      if (state.screen === "B") {
        return { ...state, screen: "C" };
      }
      // C 実行する
      return {
        ...state,
        outcome: {
          type: "approve",
          operations: selectedOperations(state.candidates, state.selection),
        },
      };
    }
  }
}

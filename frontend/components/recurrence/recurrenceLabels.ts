// Display labels for case-relative recurring templates (task 7.1,
// research.md「ビジュアルデザイン確定」, Requirements 2.1–2.5).
// Shared by Form/Detail modals and (later) the recurrence list page.

import type { CaseRelativeAnchor, NonBusinessDayPolicy, Priority } from "../../composables/useApiClient";

export const CASE_ANCHOR_OPTIONS: ReadonlyArray<{ value: CaseRelativeAnchor; label: string }> = [
  { value: "case_start", label: "案件開始日" },
  { value: "case_end", label: "案件終了日" },
  { value: "period_month_start", label: "案件期間内の各月初" },
  { value: "period_month_end", label: "案件期間内の各月末" },
];

export const NON_BUSINESS_DAY_POLICY_OPTIONS: ReadonlyArray<{
  value: NonBusinessDayPolicy;
  label: string;
}> = [
  { value: "as_is", label: "そのまま登録" },
  { value: "skip", label: "登録しない" },
  { value: "next_business_day", label: "次営業日に登録" },
  { value: "previous_business_day", label: "前営業日に登録" },
];

export const PRIORITY_OPTIONS: ReadonlyArray<{ value: Priority; label: string }> = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

const ANCHOR_LABEL: Record<CaseRelativeAnchor, string> = {
  case_start: "案件開始日",
  case_end: "案件終了日",
  period_month_start: "各月初",
  period_month_end: "各月末",
};

/** Req 2.3: direction is fixed per anchor; offset is a non-negative distance. */
const ANCHOR_DIRECTION_AFTER: Record<CaseRelativeAnchor, boolean> = {
  case_start: true,
  case_end: false,
  period_month_start: true,
  period_month_end: false,
};

export function caseAnchorLabel(anchor: CaseRelativeAnchor): string {
  return CASE_ANCHOR_OPTIONS.find((o) => o.value === anchor)?.label ?? ANCHOR_LABEL[anchor];
}

export function nonBusinessDayPolicyLabel(policy: NonBusinessDayPolicy): string {
  return NON_BUSINESS_DAY_POLICY_OPTIONS.find((o) => o.value === policy)?.label ?? policy;
}

export function priorityLabel(priority: Priority): string {
  return PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? priority;
}

export function formatOffsetLabel(anchor: CaseRelativeAnchor, offsetDays: number): string {
  const base = ANCHOR_LABEL[anchor];
  if (offsetDays === 0) return `${base}当日`;
  const unit = ANCHOR_DIRECTION_AFTER[anchor] ? "日後" : "日前";
  return `${base}の${offsetDays}${unit}`;
}

/** Hint under the offset field — non-negative only (signed mock rejected). */
export function offsetDirectionHint(anchor: CaseRelativeAnchor): string {
  switch (anchor) {
    case "case_start":
      return "案件開始日の指定日数後に登録します(例: 3 → 案件開始日の3日後)";
    case "case_end":
      return "案件終了日の指定日数前に登録します(例: 14 → 案件終了日の14日前)";
    case "period_month_start":
      return "各月初の指定日数後に登録します(例: 1 → 各月初の1日後)";
    case "period_month_end":
      return "各月末の指定日数前に登録します(例: 1 → 各月末の1日前)";
  }
}

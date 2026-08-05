// Pure logic for CaseDetailModal (task 6.3, design.md "Frontend / cases >
// CaseDetailModal" State Management block, Requirements 5.1-5.4).
// Extracted from the .vue SFC so it can be unit-tested without mounting a
// component (this repo has no @vue/test-utils / DOM test environment, see
// frontend/vitest.config.ts — same rationale as CaseFormModal.helpers.ts).
//
// Deliberately does NOT recompute overdue/derived-display logic
// (design.md CaseProgress.isOverdueWithIncomplete is the single source of
// truth for that; the .vue file reads it directly instead of duplicating
// the "終了日 < now && !isCompleted && requiredIncomplete > 0" rule here).

export interface CaseEditValidationResult {
  valid: boolean;
  error?: string;
}

// Requirement 5.3: "編集後の開始日が終了日より後になる状態で保存が実行され
// る" must be rejected client-side before hitting the API. Mirrors
// CaseFormModal.helpers.ts' validateCaseForm (same shape of check), kept as
// its own small function here rather than importing across sibling
// components — this task's boundary is CaseDetailModal.* only, and the
// check is a two-line date-string comparison, not worth a shared module.
// endDate is nullable (task 14.2, design.md 5.3/5.4/10.1) — an empty
// endDate is valid (means "no end date"), same as startDate already was.
export function validateCaseEditForm(input: { name: string; startDate: string; endDate: string }): CaseEditValidationResult {
  if (input.name.trim() === "") {
    return { valid: false, error: "案件名を入力してください" };
  }
  if (input.startDate.trim() !== "" && input.endDate.trim() !== "" && input.startDate > input.endDate) {
    return { valid: false, error: "開始日は終了日より前の日付を指定してください" };
  }
  return { valid: true };
}

export interface CaseEditFormState {
  name: string;
  startDate: string;
  endDate: string;
  isCompleted: boolean;
}

// Requirement 5.2/5.4: builds the PATCH /api/cases/:id body from the edit
// form's local refs. An empty startDate/endDate input means "no start/end
// date" (both fields are nullable, design.md CreateCaseInput/
// UpdateCaseInput), so each must be sent as `null` — not omitted (omitting
// would leave a previously-set value unchanged) and not sent as an empty
// string (the backend expects `z.coerce.date()` or null). isCompleted is
// passed through as-is: it is independent of required-task completion
// status and toggled purely by user action (Requirement 5.4).
export function buildUpdateCaseInput(form: CaseEditFormState): {
  name: string;
  startDate: string | null;
  endDate: string | null;
  isCompleted: boolean;
} {
  return {
    name: form.name.trim(),
    startDate: form.startDate.trim() === "" ? null : form.startDate,
    endDate: form.endDate.trim() === "" ? null : form.endDate,
    isCompleted: form.isCompleted,
  };
}

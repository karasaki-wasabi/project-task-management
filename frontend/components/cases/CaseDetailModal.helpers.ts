// Pure logic for CaseDetailModal (task 6.3 + task-status-model 5.6,
// design.md System Flow「案件編集保存」 / CaseDetailModal; Requirements
// 4.1–4.13 + 6.6 / 8.3). Extracted so candidate gating, PATCH body shape,
// and required-progress display decisions can be unit-tested without
// mounting the SFC. Mount coverage for checklist → final confirm → PATCH
// and completion marks lives in CaseDetailModal.test.ts.

import type { CaseProgress, DevelopmentStage, Task } from "../../composables/useApiClient";
import { isTaskCompleted, resolveTaskClosureState } from "../../composables/useTaskClosure";
import {
  buildCaseTemplateApplyCandidates,
  type CaseTemplateApplyOperation,
} from "./caseTemplateApplyCandidates";

/** Requirement 6.6: mother 0 (all required tasks cancelled) hides progress. */
export function shouldShowRequiredProgress(progress: CaseProgress | null | undefined): boolean {
  return progress != null && progress.requiredTotal > 0;
}

/**
 * Requirement 8.3 / task 5.6: mark required-task rows by stage kind.
 * Cancelled must not remain as 「未完了」.
 */
export type RequiredTaskCompletionMark = "completed" | "cancelled" | "incomplete";

export function requiredTaskCompletionMark(
  task: Pick<Task, "developmentStageId">,
  stages: readonly DevelopmentStage[],
): RequiredTaskCompletionMark {
  if (isTaskCompleted(task, stages)) {
    return "completed";
  }
  if (resolveTaskClosureState(task, stages) === "cancelled") {
    return "cancelled";
  }
  return "incomplete";
}


export interface CaseEditValidationResult {
  valid: boolean;
  error?: string;
}

// Client-side mirror of create/edit date ordering (start <= end when both set).
// endDate/startDate empty means unset (nullable).
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

export type UpdateCasePatchBody = {
  name: string;
  startDate: string | null;
  endDate: string | null;
  isCompleted: boolean;
  templateOperations?: CaseTemplateApplyOperation[];
};

/**
 * Requirements 4.5–4.12: full apply candidates for old→new date transition.
 * Empty form date strings are treated as null (unset).
 */
export function resolveEditApplyCandidates(
  oldStart: string | null | undefined,
  oldEnd: string | null | undefined,
  newStart: string,
  newEnd: string,
): CaseTemplateApplyOperation[] {
  return buildCaseTemplateApplyCandidates(
    oldStart,
    oldEnd,
    newStart.trim() === "" ? null : newStart,
    newEnd.trim() === "" ? null : newEnd,
  );
}

/**
 * Builds PATCH /api/cases/:id body.
 * - Empty start/end → null (clear field; do not omit).
 * - `templateOperations` omitted from options → key omitted (server full candidates / empty).
 * - `templateOperations` provided (including []) → sent as selected subset (Req 4.3, 4.13).
 */
export function buildUpdateCaseInput(
  form: CaseEditFormState,
  options?: { templateOperations: CaseTemplateApplyOperation[] },
): UpdateCasePatchBody {
  const body: UpdateCasePatchBody = {
    name: form.name.trim(),
    startDate: form.startDate.trim() === "" ? null : form.startDate,
    endDate: form.endDate.trim() === "" ? null : form.endDate,
    isCompleted: form.isCompleted,
  };
  if (options) {
    body.templateOperations = options.templateOperations;
  }
  return body;
}

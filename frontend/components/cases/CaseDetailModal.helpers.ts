import type { CaseProgress, DevelopmentStage, Task } from "../../composables/useApiClient";
import { isTaskCompleted, resolveTaskClosureState } from "../../composables/useTaskClosure";
import {
  buildCaseTemplateApplyCandidates,
  type CaseTemplateApplyOperation,
} from "./caseTemplateApplyCandidates";

export function shouldShowRequiredProgress(progress: CaseProgress | null | undefined): boolean {
  return progress != null && progress.requiredTotal > 0;
}

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

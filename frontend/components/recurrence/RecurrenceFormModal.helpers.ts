// Pure helpers for RecurrenceFormModal (task 7.1, Requirements 2.1–2.5).

import type {
  CaseRelativeAnchor,
  NonBusinessDayPolicy,
  Priority,
  RegisterTemplateInput,
} from "../../composables/useApiClient";

export interface RecurrenceFormFields {
  title: string;
  priority: Priority;
  caseAnchor: CaseRelativeAnchor;
  caseOffsetDays: number;
  nonBusinessDayPolicy: NonBusinessDayPolicy;
  defaultMemo: string;
}

export function validateRecurrenceForm(fields: RecurrenceFormFields): { valid: boolean; error?: string } {
  if (!fields.title.trim()) {
    return { valid: false, error: "テンプレート名を入力してください" };
  }
  if (!Number.isInteger(fields.caseOffsetDays) || fields.caseOffsetDays < 0) {
    return { valid: false, error: "オフセット日数は0以上の整数で入力してください" };
  }
  return { valid: true };
}

export function buildRegisterTemplateInput(fields: RecurrenceFormFields): RegisterTemplateInput {
  return {
    title: fields.title.trim(),
    priority: fields.priority,
    caseAnchor: fields.caseAnchor,
    caseOffsetDays: fields.caseOffsetDays,
    nonBusinessDayPolicy: fields.nonBusinessDayPolicy,
    ...(fields.defaultMemo.trim() ? { defaultMemo: fields.defaultMemo.trim() } : {}),
  };
}

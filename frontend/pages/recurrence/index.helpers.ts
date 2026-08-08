// Pure helpers for the recurrence templates index page (task 7.3,
// research.md「ビジュアルデザイン確定」, Requirements 1.3, 7.1, 7.2, 8.1–8.3).
import type { RecurringTaskTemplate } from "../../composables/useApiClient";
import {
  formatOffsetLabel,
  nonBusinessDayPolicyLabel,
} from "../../components/recurrence/recurrenceLabels";

export type TemplateStatusTone = "success" | "neutral";

export interface TemplateStatusBadge {
  tone: TemplateStatusTone;
  label: string;
}

export function templateStatusBadge(isActive: boolean): TemplateStatusBadge {
  return isActive
    ? { tone: "success", label: "有効" }
    : { tone: "neutral", label: "停止中" };
}

/** List column: case-relative offset (caseAnchor + caseOffsetDays). */
export function templateOffsetLabel(
  template: Pick<RecurringTaskTemplate, "caseAnchor" | "caseOffsetDays">,
): string {
  return formatOffsetLabel(template.caseAnchor, template.caseOffsetDays);
}

/** List column: non-business-day policy label. */
export function templatePolicyLabel(
  template: Pick<RecurringTaskTemplate, "nonBusinessDayPolicy">,
): string {
  return nonBusinessDayPolicyLabel(template.nonBusinessDayPolicy);
}

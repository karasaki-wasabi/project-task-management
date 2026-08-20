
import type { RecurringTaskTemplate } from "../../../../composables/useApiClient";
import {
  formatOffsetLabel,
  nonBusinessDayPolicyLabel,
} from "../../../../components/recurrence/recurrenceLabels";

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

export function templateOffsetLabel(
  template: Pick<RecurringTaskTemplate, "caseAnchor" | "caseOffsetDays">,
): string {
  return formatOffsetLabel(template.caseAnchor, template.caseOffsetDays);
}

export function templatePolicyLabel(
  template: Pick<RecurringTaskTemplate, "nonBusinessDayPolicy">,
): string {
  return nonBusinessDayPolicyLabel(template.nonBusinessDayPolicy);
}

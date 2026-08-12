// RecurringTaskTemplate domain types (task 2.1 template management,
// design.md "RecurrenceService" Service Interface; task 3.2 applyToCase).
// workspace-resource-scope task 4.1: RegisterTemplateInput.workspaceId is
// VerifiedWorkspaceId from request.currentWorkspaceId only.
import type { RecurringTaskTemplate } from "@prisma/client";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";

export type { RecurringTaskTemplate, Task } from "@prisma/client";
export type CaseRelativeAnchor = RecurringTaskTemplate["caseAnchor"];
export type NonBusinessDayPolicy = RecurringTaskTemplate["nonBusinessDayPolicy"];

/** design.md CaseTemplateApplyOperation — executed by applyToCase. */
export type CaseTemplateApplyOperation =
  | "start_generate"
  | "start_regenerate"
  | "start_delete"
  | "end_generate"
  | "end_regenerate"
  | "end_delete"
  | "month_generate"
  | "month_regenerate"
  | "month_delete";

export interface RegisterTemplateInput {
  title: string;
  priority: RecurringTaskTemplate["priority"];
  caseAnchor: CaseRelativeAnchor;
  caseOffsetDays: number;
  defaultDetail?: string;
  nonBusinessDayPolicy: NonBusinessDayPolicy;
  /** From request.currentWorkspaceId only (VerifiedWorkspaceId). */
  workspaceId: VerifiedWorkspaceId;
}

import type { RecurringTaskTemplate } from "@prisma/client";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";

export type { RecurringTaskTemplate, Task } from "@prisma/client";
export type CaseRelativeAnchor = RecurringTaskTemplate["caseAnchor"];
export type NonBusinessDayPolicy = RecurringTaskTemplate["nonBusinessDayPolicy"];

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
  workspaceId: VerifiedWorkspaceId;
}

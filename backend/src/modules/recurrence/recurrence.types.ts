// RecurringTaskTemplate domain types (task 2.1 template management,
// design.md "RecurrenceService" Service Interface).
import type { RecurringTaskTemplate } from "@prisma/client";

export type { RecurringTaskTemplate, Task } from "@prisma/client";
export type CaseRelativeAnchor = RecurringTaskTemplate["caseAnchor"];
export type NonBusinessDayPolicy = RecurringTaskTemplate["nonBusinessDayPolicy"];

export interface RegisterTemplateInput {
  title: string;
  priority: RecurringTaskTemplate["priority"];
  caseAnchor: CaseRelativeAnchor;
  caseOffsetDays: number;
  defaultMemo?: string;
  nonBusinessDayPolicy: NonBusinessDayPolicy;
}

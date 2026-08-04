// RecurringTaskTemplate domain types (task 9.1 template management + task
// 9.2 instance generation, design.md "Backend/recurrence" Service
// Interface).
import type { RecurringTaskTemplate } from "@prisma/client";

export type { RecurringTaskTemplate, Task } from "@prisma/client";
export type RecurrenceKind = RecurringTaskTemplate["kind"];
export type IntervalUnit = NonNullable<RecurringTaskTemplate["intervalUnit"]>;
export type NonBusinessDayPolicy = RecurringTaskTemplate["nonBusinessDayPolicy"];

export interface RegisterTemplateInput {
  title: string;
  priority: RecurringTaskTemplate["priority"];
  kind: RecurrenceKind;
  intervalUnit?: IntervalUnit;
  intervalValue?: number;
  boundCaseId?: string;
  caseOffsetDays?: number;
  defaultMemo?: string;
  nonBusinessDayPolicy: NonBusinessDayPolicy;
}

// RecurringTaskTemplate domain types (task 9.1, design.md
// "Backend/recurrence" Service Interface). Instance-generation types
// (task 9.2) are added later in this same file's evolution.
import type { RecurringTaskTemplate } from "@prisma/client";

export type { RecurringTaskTemplate } from "@prisma/client";
export type RecurrenceKind = RecurringTaskTemplate["kind"];
export type IntervalUnit = NonNullable<RecurringTaskTemplate["intervalUnit"]>;
export type NonBusinessDayPolicy = RecurringTaskTemplate["nonBusinessDayPolicy"];

export interface RegisterTemplateInput {
  title: string;
  priority: RecurringTaskTemplate["priority"];
  kind: RecurrenceKind;
  intervalUnit?: IntervalUnit;
  intervalValue?: number;
  boundDeliveryId?: string;
  deliveryOffsetDays?: number;
  defaultMemo?: string;
  nonBusinessDayPolicy: NonBusinessDayPolicy;
}

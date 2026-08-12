import type { ActivityLog as PrismaActivityLog } from "@prisma/client";

export type OperationType =
  | "task_created"
  | "task_deleted"
  | "field_changed"
  | "comment_created"
  | "comment_edited"
  | "comment_deleted";

export type FieldName =
  | "title"
  | "status"
  | "priority"
  | "detail"
  | "assignee"
  | "case"
  | "isRequiredForCase"
  | "developmentStage"
  | "parentTask"
  | "scheduledEndDate";

export type RecordActorInput =
  | { type: "user"; userId: string }
  | { type: "system"; sourceLabel: string };

interface RecordActivityLogBase {
  taskId: string;
  actor: RecordActorInput;
}

export type RecordActivityLogInput =
  | (RecordActivityLogBase & {
      operation: "field_changed";
      field: FieldName;
      beforeValue?: string | null;
      afterValue?: string | null;
    })
  | (RecordActivityLogBase & {
      operation: Exclude<OperationType, "field_changed">;
      field?: never;
      beforeValue?: never;
      afterValue?: never;
    });

export type ActivityLogEntry = PrismaActivityLog;

// Task domain types (task 3.1, design.md "Backend/tasks" Service Interface).
// `addChild`/`splitTask` and their hierarchy-specific validation land in
// task 3.2; `parentTaskId` is already part of the shared CreateTaskInput
// shape per design.md so this task accepts it (and lets Prisma's FK
// constraint reject a non-existent parent) without implementing hierarchy
// business rules yet.
import type { Task as PrismaTask } from "@prisma/client";

export type { Task } from "@prisma/client";
export type TaskStatus = PrismaTask["status"];
export type Priority = PrismaTask["priority"];

export interface CreateTaskInput {
  title: string;
  priority: Priority;
  memo?: string;
  caseId?: string;
  isRequiredForCase?: boolean;
  assigneeUserId?: string;
  parentTaskId?: string;
  // RecurrenceService-only fields (design.md "Backend/recurrence"
  // Implementation Notes: instance generation goes through this internal
  // function rather than duplicating the Prisma insert). Never set by the
  // public POST /api/tasks route's own request schema.
  sourceTemplateId?: string;
  // Snapshot of the template caseAnchor at generation time (Req 5.3).
  sourceAnchor?: PrismaTask["sourceAnchor"];
  scheduledDate?: Date;
}

export interface TaskListFilter {
  caseId?: string;
  assigneeUserId?: string;
  // design.md "Backend/tasks > TasksService.list 未割当フィルタ拡張": when
  // truthy, exclusively filters caseId IS NULL regardless of any other
  // caseId value also present on this filter.
  unassignedCase?: boolean;
}

export interface UpdateTaskInput {
  title?: string;
  priority?: Priority;
  memo?: string | null;
  caseId?: string | null;
  isRequiredForCase?: boolean;
  assigneeUserId?: string | null;
}

export type TaskError =
  | { type: "not_found"; taskId: string }
  | { type: "incomplete_children"; taskId: string }
  | { type: "validation_error"; message: string };

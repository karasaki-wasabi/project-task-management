// Task domain types (task 3.1, design.md "Backend/tasks" Service Interface).
// `addChild`/`splitTask` and their hierarchy-specific validation land in
// task 3.2; `parentTaskId` is already part of the shared CreateTaskInput
// shape per design.md so this task accepts it (and lets Prisma's FK
// constraint reject a non-existent parent) without implementing hierarchy
// business rules yet.
// workspace-resource-scope task 3.1: CreateTaskInput / TaskListFilter require
// VerifiedWorkspaceId (clients cannot set it via body).
import type { Task as PrismaTask } from "@prisma/client";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";

export type { Task } from "@prisma/client";
export type TaskStatus = PrismaTask["status"];
export type Priority = PrismaTask["priority"];

export interface CreateTaskInput {
  title: string;
  priority: Priority;
  detail?: string;
  caseId?: string;
  isRequiredForCase?: boolean;
  assigneeUserId?: string;
  parentTaskId?: string;
  // RecurrenceService-only source metadata. scheduledEndDate is also accepted
  // by the public create route so task duplication can finish in one request.
  sourceTemplateId?: string;
  // Snapshot of the template caseAnchor at generation time (Req 5.3).
  sourceAnchor?: PrismaTask["sourceAnchor"];
  scheduledEndDate?: Date;
  /** From request.currentWorkspaceId only (VerifiedWorkspaceId). */
  workspaceId: VerifiedWorkspaceId;
}

export interface TaskListFilter {
  caseId?: string;
  assigneeUserId?: string;
  titleContains?: string;
  excludeSubtreeOf?: string;
  excludeClosed?: boolean;
  // design.md "Backend/tasks > TasksService.list 未割当フィルタ拡張": when
  // truthy, exclusively filters caseId IS NULL regardless of any other
  // caseId value also present on this filter.
  unassignedCase?: boolean;
  /** Current workspace scope (VerifiedWorkspaceId). */
  workspaceId: VerifiedWorkspaceId;
}

export interface UpdateTaskInput {
  title?: string;
  priority?: Priority;
  detail?: string | null;
  caseId?: string | null;
  isRequiredForCase?: boolean;
  assigneeUserId?: string | null;
  parentTaskId?: string | null;
  scheduledEndDate?: Date | null;
}

export interface GetTaskOptions {
  includeDeleted?: boolean;
}

export type TaskError =
  | { type: "not_found"; taskId: string }
  | { type: "deleted_task"; taskId: string }
  | { type: "incomplete_children"; taskId: string }
  // task-status-model 3.2: status edits are rejected on terminal stages (4.5).
  | { type: "status_not_applicable"; taskId: string }
  // task-status-model 3.3: closed tasks cannot gain open children (5.5, 5.6).
  | { type: "closed_task_cannot_take_children"; taskId: string }
  | { type: "validation_error"; message: string };

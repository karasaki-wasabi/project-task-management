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
  storyPoints?: number;
  sourceTemplateId?: string;
  sourceAnchor?: PrismaTask["sourceAnchor"];
  scheduledEndDate?: Date;
  workspaceId: VerifiedWorkspaceId;
}

export interface TaskListFilter {
  caseId?: string;
  assigneeUserId?: string;
  titleContains?: string;
  excludeSubtreeOf?: string;
  excludeClosed?: boolean;
  unassignedCase?: boolean;
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
  storyPoints?: number | null;
}

export interface GetTaskOptions {
  includeDeleted?: boolean;
}

export type TaskError =
  | { type: "not_found"; taskId: string }
  | { type: "deleted_task"; taskId: string }
  | { type: "incomplete_children"; taskId: string }
  | { type: "status_not_applicable"; taskId: string }
  | { type: "closed_task_cannot_take_children"; taskId: string }
  | { type: "validation_error"; message: string };

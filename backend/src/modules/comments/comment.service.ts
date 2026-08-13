import { db } from "../../shared/db.js";
import { badRequest, forbidden, HttpError, notFound } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { activityLogService } from "../activity-logs/activity-log.service.js";
import { tasksService } from "../tasks/task.service.js";
import { commentRepository, type TimelinePageQuery } from "./comment.repository.js";
import type { Comment } from "./comment.types.js";

function assertBody(body: string): void {
  if (body.trim().length === 0) {
    throw badRequest("Comment body is required");
  }
}

async function assertTaskWritable(
  taskId: string,
  workspaceId: VerifiedWorkspaceId,
): Promise<void> {
  const result = await tasksService.getById(taskId, workspaceId, { includeDeleted: true });
  if (!result.ok) {
    throw notFound(`Task not found: ${taskId}`);
  }
  if (result.value.deletedAt !== null) {
    throw new HttpError(409, `Task is deleted: ${taskId}`);
  }
}

export const commentService = {
  list(taskId: string, page?: TimelinePageQuery): Promise<Comment[]> {
    return commentRepository.list(taskId, page);
  },

  async create(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    authorUserId: string,
    body: string,
  ): Promise<Comment> {
    assertBody(body);
    await assertTaskWritable(taskId, workspaceId);

    return db.$transaction(async (tx) => {
      const comment = await commentRepository.create(taskId, authorUserId, body, tx);
      await activityLogService.record(
        {
          taskId,
          actor: { type: "user", userId: authorUserId },
          operation: "comment_created",
        },
        tx,
      );
      return comment;
    });
  },

  async update(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    commentId: string,
    requesterUserId: string,
    body: string,
  ): Promise<Comment> {
    assertBody(body);
    await assertTaskWritable(taskId, workspaceId);

    return db.$transaction(async (tx) => {
      const current = await commentRepository.findByIdForTask(commentId, taskId, tx);
      if (!current) {
        throw notFound(`Comment not found: ${commentId}`);
      }
      if (current.authorUserId !== requesterUserId) {
        throw forbidden("Only the comment author can edit this comment");
      }

      const comment = await commentRepository.update(commentId, body, new Date(), tx);
      await activityLogService.record(
        {
          taskId,
          actor: { type: "user", userId: requesterUserId },
          operation: "comment_edited",
        },
        tx,
      );
      return comment;
    });
  },

  async delete(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    commentId: string,
    requesterUserId: string,
  ): Promise<void> {
    await assertTaskWritable(taskId, workspaceId);

    await db.$transaction(async (tx) => {
      const current = await commentRepository.findByIdForTask(commentId, taskId, tx);
      if (!current) {
        throw notFound(`Comment not found: ${commentId}`);
      }
      if (current.authorUserId !== requesterUserId) {
        throw forbidden("Only the comment author can delete this comment");
      }

      await commentRepository.delete(commentId, tx);
      await activityLogService.record(
        {
          taskId,
          actor: { type: "user", userId: requesterUserId },
          operation: "comment_deleted",
        },
        tx,
      );
    });
  },
};

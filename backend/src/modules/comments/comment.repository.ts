import { db } from "../../shared/db.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import type { Comment } from "./comment.types.js";

export type TaskWriteState = "active" | "deleted" | "missing";

export const commentRepository = {
  async getTaskWriteState(
    taskId: string,
    workspaceId: VerifiedWorkspaceId,
    client: DbClient = db,
  ): Promise<TaskWriteState> {
    const activeTask = await client.task.findFirst({
      where: { id: taskId, workspaceId },
      select: { id: true },
    });
    if (activeTask) return "active";

    const deletedTask = await client.task.findFirst({
      where: {
        id: taskId,
        workspaceId,
        deletedAt: { not: null },
      },
      select: { id: true },
    });
    return deletedTask ? "deleted" : "missing";
  },

  list(taskId: string): Promise<Comment[]> {
    return db.comment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  findByIdForTask(commentId: string, taskId: string, client: DbClient = db): Promise<Comment | null> {
    return client.comment.findFirst({
      where: { id: commentId, taskId },
    });
  },

  create(taskId: string, authorUserId: string, body: string, client: DbClient = db): Promise<Comment> {
    return client.comment.create({
      data: { taskId, authorUserId, body },
    });
  },

  update(commentId: string, body: string, editedAt: Date, client: DbClient = db): Promise<Comment> {
    return client.comment.update({
      where: { id: commentId },
      data: { body, editedAt },
    });
  },

  async delete(commentId: string, client: DbClient = db): Promise<void> {
    await client.comment.delete({ where: { id: commentId } });
  },
};

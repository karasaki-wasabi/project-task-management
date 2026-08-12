import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { commentService } from "./comment.service.js";

const commentBodySchema = z.object({
  body: z.string(),
});
const taskParamsSchema = z.object({
  id: z.string(),
});
const commentParamsSchema = z.object({
  id: z.string(),
  commentId: z.string(),
});

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

function requireCurrentWorkspaceId(request: FastifyRequest): VerifiedWorkspaceId {
  if (!request.currentWorkspaceId) {
    throw badRequest("X-Workspace-Id is required");
  }
  return request.currentWorkspaceId;
}

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/tasks/:id/comments", async (request, reply) => {
    const params = parseOrBadRequest(taskParamsSchema, request.params);
    const body = parseOrBadRequest(commentBodySchema, request.body);
    const comment = await commentService.create(
      params.id,
      requireCurrentWorkspaceId(request),
      request.currentUser!.id,
      body.body,
    );
    reply.status(201).send(comment);
  });

  app.patch("/api/tasks/:id/comments/:commentId", async (request, reply) => {
    const params = parseOrBadRequest(commentParamsSchema, request.params);
    const body = parseOrBadRequest(commentBodySchema, request.body);
    const comment = await commentService.update(
      params.id,
      requireCurrentWorkspaceId(request),
      params.commentId,
      request.currentUser!.id,
      body.body,
    );
    reply.status(200).send(comment);
  });

  app.delete("/api/tasks/:id/comments/:commentId", async (request, reply) => {
    const params = parseOrBadRequest(commentParamsSchema, request.params);
    await commentService.delete(
      params.id,
      requireCurrentWorkspaceId(request),
      params.commentId,
      request.currentUser!.id,
    );
    reply.status(204).send();
  });
}

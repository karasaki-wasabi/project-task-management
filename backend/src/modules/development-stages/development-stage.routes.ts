// HTTP routes for Development Stages (task 14.1, design.md
// "Backend/development-stages" API Contract). Registered into the shared
// app in task 16.1; standalone Fastify plugin here so this module stays
// testable in isolation.
// workspace-resource-scope task 6.1: passes request.currentWorkspaceId into
// DevelopmentStagesService; clients cannot set workspaceId via body.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { developmentStagesService } from "./development-stage.service.js";

const createBodySchema = z.object({ name: z.string() });
const renameBodySchema = z.object({ name: z.string() });
const reorderBodySchema = z.object({ orderedIds: z.array(z.string()) });
const stageIdParamsSchema = z.object({ id: z.string() });

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

export async function developmentStageRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/development-stages", async (request, reply) => {
    const body = parseOrBadRequest(createBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const stage = await developmentStagesService.create(body.name, workspaceId);
    reply.status(201).send(stage);
  });

  app.patch("/api/development-stages/:id", async (request) => {
    const params = parseOrBadRequest(stageIdParamsSchema, request.params);
    const body = parseOrBadRequest(renameBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    return developmentStagesService.rename(params.id, workspaceId, body.name);
  });

  app.post("/api/development-stages/reorder", async (request) => {
    const body = parseOrBadRequest(reorderBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    return developmentStagesService.reorder(body.orderedIds, workspaceId);
  });

  app.delete("/api/development-stages/:id", async (request, reply) => {
    const params = parseOrBadRequest(stageIdParamsSchema, request.params);
    const workspaceId = requireCurrentWorkspaceId(request);
    await developmentStagesService.delete(params.id, workspaceId, request.id);
    reply.status(204).send();
  });

  app.get("/api/development-stages", async (request) => {
    const workspaceId = requireCurrentWorkspaceId(request);
    return developmentStagesService.list(workspaceId);
  });
}

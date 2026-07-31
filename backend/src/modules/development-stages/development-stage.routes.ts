// HTTP routes for Development Stages (task 14.1, design.md
// "Backend/development-stages" API Contract). Registered into the shared
// app in task 16.1; standalone Fastify plugin here so this module stays
// testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
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

export async function developmentStageRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/development-stages", async (request, reply) => {
    const body = parseOrBadRequest(createBodySchema, request.body);
    const stage = await developmentStagesService.create(body.name);
    reply.status(201).send(stage);
  });

  app.patch("/api/development-stages/:id", async (request) => {
    const params = parseOrBadRequest(stageIdParamsSchema, request.params);
    const body = parseOrBadRequest(renameBodySchema, request.body);
    return developmentStagesService.rename(params.id, body.name);
  });

  app.post("/api/development-stages/reorder", async (request) => {
    const body = parseOrBadRequest(reorderBodySchema, request.body);
    return developmentStagesService.reorder(body.orderedIds);
  });

  app.delete("/api/development-stages/:id", async (request, reply) => {
    const params = parseOrBadRequest(stageIdParamsSchema, request.params);
    await developmentStagesService.delete(params.id, request.id);
    reply.status(204).send();
  });

  app.get("/api/development-stages", async () => {
    return developmentStagesService.list();
  });
}

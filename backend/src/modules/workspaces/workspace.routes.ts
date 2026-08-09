// HTTP routes for Workspaces CRUD (task 4.1, design.md "Backend/workspaces"
// API Contract; Requirements 1.1, 1.2, 2.4, 6.1–6.5, 7.1–7.4). Auth is applied
// globally by user-auth's requireUser in app.ts; this plugin reads
// request.currentUser and does not register its own guard.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { workspaceService } from "./workspace.service.js";
import { WORKSPACE_COLORS } from "./workspace.types.js";

const createWorkspaceBodySchema = z.object({
  name: z.string(),
});

const updateWorkspaceBodySchema = z.object({
  name: z.string().optional(),
  color: z.enum(WORKSPACE_COLORS).optional(),
});

const workspaceIdParamsSchema = z.object({ id: z.string() });

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/workspaces", async (request, reply) => {
    const body = parseOrBadRequest(createWorkspaceBodySchema, request.body);
    const workspace = await workspaceService.create(
      { name: body.name, createdByUserId: request.currentUser!.id },
      request.id,
    );
    reply.status(201).send(workspace);
  });

  app.get("/api/workspaces", async (request) => {
    return workspaceService.list(request.currentUser!.id);
  });

  app.patch("/api/workspaces/:id", async (request, reply) => {
    const params = parseOrBadRequest(workspaceIdParamsSchema, request.params);
    const body = parseOrBadRequest(updateWorkspaceBodySchema, request.body);
    const workspace = await workspaceService.update(
      params.id,
      body,
      request.currentUser!.id,
      request.id,
    );
    reply.status(200).send(workspace);
  });

  app.delete("/api/workspaces/:id", async (request, reply) => {
    const params = parseOrBadRequest(workspaceIdParamsSchema, request.params);
    await workspaceService.delete(params.id, request.currentUser!.id, request.id);
    reply.status(204).send();
  });
}

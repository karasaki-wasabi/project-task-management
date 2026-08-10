// HTTP routes for Holidays (task 6.1 manual management + task 6.2 external
// sync, design.md "Backend/holidays" API Contract). Registered into the
// shared app in task 10.3; standalone Fastify plugin here so this module
// stays testable in isolation.
// workspace-resource-scope task 5.1: passes request.currentWorkspaceId into
// HolidaysService; clients cannot set workspaceId via body.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { holidaysService } from "./holiday.service.js";

const registerBodySchema = z.object({ date: z.string(), label: z.string().optional() });
const holidayIdParamsSchema = z.object({ id: z.string() });

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

export async function holidayRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/holidays", async (request, reply) => {
    const body = parseOrBadRequest(registerBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const holiday = await holidaysService.register({ ...body, workspaceId });
    reply.status(201).send(holiday);
  });

  app.delete("/api/holidays/:id", async (request, reply) => {
    const params = parseOrBadRequest(holidayIdParamsSchema, request.params);
    const workspaceId = requireCurrentWorkspaceId(request);
    await holidaysService.remove(params.id, workspaceId, request.id);
    reply.status(204).send();
  });

  app.get("/api/holidays", async (request) => {
    const workspaceId = requireCurrentWorkspaceId(request);
    return holidaysService.list(workspaceId);
  });

  app.post("/api/holidays/sync", async (request) => {
    const workspaceId = requireCurrentWorkspaceId(request);
    return holidaysService.syncFromExternalApi(workspaceId);
  });
}

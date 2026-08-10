// HTTP routes for Cases (task 3.3, design.md "Backend/cases" API Contract;
// renamed/extended from the former deliveries/delivery.routes.ts, task 4.1).
// Registered into the shared app in this same task; standalone Fastify
// plugin here so this module stays testable in isolation.
// workspace-resource-scope task 2.1: passes request.currentWorkspaceId into
// CaseService; clients cannot set workspaceId via body.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { caseService } from "./case.service.js";

const caseTemplateApplyOperationSchema = z.enum([
  "start_generate",
  "start_regenerate",
  "start_delete",
  "end_generate",
  "end_regenerate",
  "end_delete",
  "month_generate",
  "month_regenerate",
  "month_delete",
]);

const createCaseBodySchema = z.object({
  name: z.string(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  // Task 4 / design.md CaseCreateInput: omit = full candidates, [] = no apply.
  templateOperations: z.array(caseTemplateApplyOperationSchema).optional(),
});
// design.md "Backend/cases" Implementation Notes: PATCH replaces the old
// due-date-only update with a generic field update — every field is
// independently optional, and startDate may be explicitly cleared with
// null.
const updateCaseBodySchema = z.object({
  name: z.string().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  isCompleted: z.boolean().optional(),
  templateOperations: z.array(caseTemplateApplyOperationSchema).optional(),
});
const caseIdParamsSchema = z.object({ id: z.string() });

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

export async function caseRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/cases", async (request, reply) => {
    const body = parseOrBadRequest(createCaseBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const caseEntity = await caseService.create({ ...body, workspaceId }, request.id);
    reply.status(201).send(caseEntity);
  });

  app.patch("/api/cases/:id", async (request, reply) => {
    const params = parseOrBadRequest(caseIdParamsSchema, request.params);
    const body = parseOrBadRequest(updateCaseBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const caseEntity = await caseService.update(params.id, workspaceId, body, request.id);
    reply.status(200).send(caseEntity);
  });

  app.get("/api/cases/:id/progress", async (request) => {
    const params = parseOrBadRequest(caseIdParamsSchema, request.params);
    const workspaceId = requireCurrentWorkspaceId(request);
    return caseService.getProgress(params.id, workspaceId);
  });

  app.delete("/api/cases/:id", async (request, reply) => {
    const params = parseOrBadRequest(caseIdParamsSchema, request.params);
    const workspaceId = requireCurrentWorkspaceId(request);
    await caseService.delete(params.id, workspaceId, request.id);
    reply.status(204).send();
  });

  app.get("/api/cases", async (request) => {
    const workspaceId = requireCurrentWorkspaceId(request);
    return caseService.list(workspaceId);
  });
}

// HTTP routes for Cases (task 3.3, design.md "Backend/cases" API Contract;
// renamed/extended from the former deliveries/delivery.routes.ts, task 4.1).
// Registered into the shared app in this same task; standalone Fastify
// plugin here so this module stays testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { caseService } from "./case.service.js";

const createCaseBodySchema = z.object({
  name: z.string(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
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
});
const caseIdParamsSchema = z.object({ id: z.string() });

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

export async function caseRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/cases", async (request, reply) => {
    const body = parseOrBadRequest(createCaseBodySchema, request.body);
    const caseEntity = await caseService.create(body, request.id);
    reply.status(201).send(caseEntity);
  });

  app.patch("/api/cases/:id", async (request, reply) => {
    const params = parseOrBadRequest(caseIdParamsSchema, request.params);
    const body = parseOrBadRequest(updateCaseBodySchema, request.body);
    const caseEntity = await caseService.update(params.id, body);
    reply.status(200).send(caseEntity);
  });

  app.get("/api/cases/:id/progress", async (request) => {
    const params = parseOrBadRequest(caseIdParamsSchema, request.params);
    return caseService.getProgress(params.id);
  });

  app.delete("/api/cases/:id", async (request, reply) => {
    const params = parseOrBadRequest(caseIdParamsSchema, request.params);
    await caseService.delete(params.id, request.id);
    reply.status(204).send();
  });

  app.get("/api/cases", async () => {
    return caseService.list();
  });
}

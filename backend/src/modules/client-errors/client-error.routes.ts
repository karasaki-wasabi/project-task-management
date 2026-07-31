// HTTP routes for ClientErrors (task 8.1, design.md "Backend/client-errors"
// API Contract). Registered into the shared app in task 10.3; standalone
// Fastify plugin here so this module stays testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { clientErrorsService } from "./client-error.service.js";

const reportBodySchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  pageUrl: z.string(),
  occurredAt: z.string(),
});

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

export async function clientErrorRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/client-errors", async (request, reply) => {
    const body = parseOrBadRequest(reportBodySchema, request.body);
    await clientErrorsService.report(body, request.id);
    reply.status(204).send();
  });
}

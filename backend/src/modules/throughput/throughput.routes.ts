// HTTP routes for Throughput (task 7.1, design.md "Backend/throughput" API
// Contract). Registered into the shared app in task 10.3; standalone
// Fastify plugin here so this module stays testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { throughputService } from "./throughput.service.js";

const querySchema = z.object({
  periodType: z.enum(["week", "month"]),
  rangeCount: z.coerce.number().int().min(1),
});

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

export async function throughputRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/throughput", async (request) => {
    const query = parseOrBadRequest(querySchema, request.query);
    return throughputService.getSummary(query.periodType, query.rangeCount);
  });
}

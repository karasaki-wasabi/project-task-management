// HTTP routes for Throughput (task 7.1, design.md "Backend/throughput" API
// Contract). Registered into the shared app in task 10.3; standalone
// Fastify plugin here so this module stays testable in isolation.
// Workspace header wiring (velocity-dashboard 3.4/3.5) comes later — pass
// request.currentWorkspaceId through for compile/call-site alignment only.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
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
    return throughputService.getSummary(
      query.periodType,
      query.rangeCount,
      request.currentWorkspaceId as VerifiedWorkspaceId,
    );
  });
}

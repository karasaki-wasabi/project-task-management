// HTTP routes for Throughput (task 7.1, design.md "Backend/throughput" API
// Contract; velocity-dashboard task 3.4 extends query + response).
// Registered into the shared app in task 10.3; standalone Fastify plugin
// here so this module stays testable in isolation.
// WORKSPACE_SCOPED_PATH_PREFIXES includes /api/throughput (task 3.5);
// this module forwards request.currentWorkspaceId into ThroughputService.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { throughputService } from "./throughput.service.js";
import type { ThroughputSummary } from "./throughput.types.js";

const querySchema = z.object({
  periodType: z.enum(["week", "month"]),
  rangeCount: z.coerce.number().int().min(1),
  caseId: z.string().min(1).optional(),
});

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

/** API Contract: period boundaries as ISO 8601 strings (design.md ThroughputRoutes). */
function serializeSummary(summary: ThroughputSummary) {
  const body = {
    periods: summary.periods.map((period) => ({
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      completedCount: period.completedCount,
      completedPoints: period.completedPoints,
    })),
    forecastNextPeriodCount: summary.forecastNextPeriodCount,
    forecastNextPeriodPoints: summary.forecastNextPeriodPoints,
  };
  if (summary.caseOutlook !== undefined) {
    return { ...body, caseOutlook: summary.caseOutlook };
  }
  return body;
}

export async function throughputRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/throughput", async (request) => {
    const query = parseOrBadRequest(querySchema, request.query);
    const summary = await throughputService.getSummary(
      query.periodType,
      query.rangeCount,
      request.currentWorkspaceId as VerifiedWorkspaceId,
      query.caseId,
    );
    return serializeSummary(summary);
  });
}

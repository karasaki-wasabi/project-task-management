// HTTP routes for RecurrenceService template management (task 2.1,
// design.md API table). Registered into the shared app elsewhere;
// standalone Fastify plugin here so this module stays testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { recurrenceService } from "./recurrence.service.js";

const priority = z.enum(["high", "medium", "low"]);
const caseAnchor = z.enum(["case_start", "case_end", "period_month_start", "period_month_end"]);
const nonBusinessDayPolicy = z.enum(["as_is", "skip", "next_business_day", "previous_business_day"]);

const registerTemplateBodySchema = z.object({
  title: z.string(),
  priority,
  caseAnchor,
  caseOffsetDays: z.number().int().nonnegative(),
  defaultMemo: z.string().optional(),
  nonBusinessDayPolicy,
});
const templateIdParamsSchema = z.object({ id: z.string() });

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

export async function recurrenceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/recurring-templates", async (request, reply) => {
    const body = parseOrBadRequest(registerTemplateBodySchema, request.body);
    const template = await recurrenceService.registerTemplate(body);
    reply.status(201).send(template);
  });

  app.post("/api/recurring-templates/:id/stop", async (request, reply) => {
    const params = parseOrBadRequest(templateIdParamsSchema, request.params);
    await recurrenceService.stopTemplate(params.id);
    reply.status(204).send();
  });

  app.post("/api/recurring-templates/:id/resume", async (request, reply) => {
    const params = parseOrBadRequest(templateIdParamsSchema, request.params);
    await recurrenceService.resumeTemplate(params.id);
    reply.status(204).send();
  });

  app.delete("/api/recurring-templates/:id", async (request, reply) => {
    const params = parseOrBadRequest(templateIdParamsSchema, request.params);
    await recurrenceService.deleteTemplate(params.id, request.id);
    reply.status(204).send();
  });

  app.get("/api/recurring-templates", async () => {
    return recurrenceService.list();
  });
}

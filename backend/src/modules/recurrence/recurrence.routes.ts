// HTTP routes for RecurrenceService template management (task 9.1) + manual
// generation trigger (task 9.3, design.md "Backend/recurrence" API
// Contract, plus GET /api/recurring-templates — see
// recurrence.routes.test.ts header comment for why this list endpoint was
// added despite not being in design.md's API Contract table). Registered
// into the shared app in task 10.3; standalone Fastify plugin here so this
// module stays testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { recurrenceService } from "./recurrence.service.js";

const priority = z.enum(["high", "medium", "low"]);
const intervalUnit = z.enum(["day", "week", "month"]);
const nonBusinessDayPolicy = z.enum(["as_is", "skip", "next_business_day", "previous_business_day"]);

const registerTemplateBodySchema = z.object({
  title: z.string(),
  priority,
  kind: z.enum(["fixed_interval", "delivery_relative"]),
  intervalUnit: intervalUnit.optional(),
  intervalValue: z.number().optional(),
  boundDeliveryId: z.string().optional(),
  deliveryOffsetDays: z.number().optional(),
  defaultMemo: z.string().optional(),
  nonBusinessDayPolicy,
});
const templateIdParamsSchema = z.object({ id: z.string() });
const generateDueBodySchema = z.object({ asOf: z.coerce.date().optional() });

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

  app.delete("/api/recurring-templates/:id", async (request, reply) => {
    const params = parseOrBadRequest(templateIdParamsSchema, request.params);
    await recurrenceService.deleteTemplate(params.id);
    reply.status(204).send();
  });

  app.get("/api/recurring-templates", async () => {
    return recurrenceService.list();
  });

  app.post("/api/recurring-templates/generate-due", async (request) => {
    const body = parseOrBadRequest(generateDueBodySchema, request.body ?? {});
    return recurrenceService.generateDueInstances(body.asOf ?? new Date());
  });
}

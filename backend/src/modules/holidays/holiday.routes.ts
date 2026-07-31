// HTTP routes for Holidays (task 6.1 manual management + task 6.2 external
// sync, design.md "Backend/holidays" API Contract). Registered into the
// shared app in task 10.3; standalone Fastify plugin here so this module
// stays testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
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

export async function holidayRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/holidays", async (request, reply) => {
    const body = parseOrBadRequest(registerBodySchema, request.body);
    const holiday = await holidaysService.register(body);
    reply.status(201).send(holiday);
  });

  app.delete("/api/holidays/:id", async (request, reply) => {
    const params = parseOrBadRequest(holidayIdParamsSchema, request.params);
    await holidaysService.remove(params.id);
    reply.status(204).send();
  });

  app.get("/api/holidays", async () => {
    return holidaysService.list();
  });

  app.post("/api/holidays/sync", async () => {
    return holidaysService.syncFromExternalApi();
  });
}

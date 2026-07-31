// HTTP routes for Events (task 5.1, design.md "Backend/events" API
// Contract). Registered into the shared app in task 10.3; standalone Fastify
// plugin here so this module stays testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { eventsService } from "./event.service.js";

const createEventBodySchema = z.object({
  title: z.string(),
  occursAt: z.coerce.date(),
  deliveryId: z.string().optional(),
  assigneeUserId: z.string().optional(),
});
const eventIdParamsSchema = z.object({ id: z.string() });
const listQuerySchema = z.object({ assigneeUserId: z.string().optional() });

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/events", async (request, reply) => {
    const body = parseOrBadRequest(createEventBodySchema, request.body);
    const event = await eventsService.create(body);
    reply.status(201).send(event);
  });

  app.delete("/api/events/:id", async (request, reply) => {
    const params = parseOrBadRequest(eventIdParamsSchema, request.params);
    await eventsService.delete(params.id);
    reply.status(204).send();
  });

  app.get("/api/events", async (request) => {
    const query = parseOrBadRequest(listQuerySchema, request.query);
    return eventsService.list(query);
  });
}

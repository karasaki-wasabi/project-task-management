// HTTP routes for Deliveries (task 4.1, design.md "Backend/deliveries" API
// Contract). Registered into the shared app in task 10.3; standalone Fastify
// plugin here so this module stays testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { deliveriesService } from "./delivery.service.js";

const createDeliveryBodySchema = z.object({
  name: z.string(),
  dueDate: z.coerce.date(),
});
const updateDueDateBodySchema = z.object({ dueDate: z.coerce.date() });
const deliveryIdParamsSchema = z.object({ id: z.string() });

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

export async function deliveryRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/deliveries", async (request, reply) => {
    const body = parseOrBadRequest(createDeliveryBodySchema, request.body);
    const delivery = await deliveriesService.create(body, request.id);
    reply.status(201).send(delivery);
  });

  app.patch("/api/deliveries/:id", async (request, reply) => {
    const params = parseOrBadRequest(deliveryIdParamsSchema, request.params);
    const body = parseOrBadRequest(updateDueDateBodySchema, request.body);
    const delivery = await deliveriesService.updateDueDate(params.id, body.dueDate);
    reply.status(200).send(delivery);
  });

  app.get("/api/deliveries/:id/progress", async (request) => {
    const params = parseOrBadRequest(deliveryIdParamsSchema, request.params);
    return deliveriesService.getProgress(params.id);
  });

  app.delete("/api/deliveries/:id", async (request, reply) => {
    const params = parseOrBadRequest(deliveryIdParamsSchema, request.params);
    await deliveriesService.delete(params.id, request.id);
    reply.status(204).send();
  });

  app.get("/api/deliveries", async () => {
    return deliveriesService.list();
  });
}

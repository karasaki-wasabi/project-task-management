// HTTP routes for Users (task 2.1, design.md "Backend/users" API Contract).
// Registered into the shared app in task 10.3; kept as a standalone Fastify
// plugin here so this module stays testable in isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { usersService } from "./user.service.js";

const createUserBodySchema = z.object({ name: z.string() });
const userIdParamsSchema = z.object({ id: z.string() });

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/users", async (request, reply) => {
    const body = parseOrBadRequest(createUserBodySchema, request.body);
    const user = await usersService.create(body.name);
    reply.status(201).send(user);
  });

  app.get("/api/users", async () => {
    return usersService.list();
  });

  app.delete("/api/users/:id", async (request, reply) => {
    const params = parseOrBadRequest(userIdParamsSchema, request.params);
    await usersService.delete(params.id, request.id);
    reply.status(204).send();
  });
}

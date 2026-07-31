// HTTP routes for Tasks (task 3.1 core + task 3.2 hierarchy/split,
// design.md "Backend/tasks" API Contract). Registered into the shared app in
// task 10.3; standalone Fastify plugin here so this module stays testable in
// isolation.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import { tasksService } from "./task.service.js";
import type { TaskError } from "./task.types.js";

const priority = z.enum(["high", "medium", "low"]);
const taskStatus = z.enum(["not_started", "in_progress", "done", "on_hold"]);

const createTaskBodySchema = z.object({
  title: z.string(),
  priority,
  memo: z.string().optional(),
  deliveryId: z.string().optional(),
  isRequiredForDelivery: z.boolean().optional(),
  assigneeUserId: z.string().optional(),
  parentTaskId: z.string().optional(),
});
const updateStatusBodySchema = z.object({ status: taskStatus });
const splitBodySchema = z.object({ parts: z.array(createTaskBodySchema) });
const taskIdParamsSchema = z.object({ id: z.string() });
const listQuerySchema = z.object({
  deliveryId: z.string().optional(),
  assigneeUserId: z.string().optional(),
});

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

function taskErrorStatusCode(error: TaskError): number {
  switch (error.type) {
    case "not_found":
      return 404;
    case "incomplete_children":
      return 409;
    case "validation_error":
      return 400;
  }
}

function taskErrorMessage(error: TaskError): string {
  switch (error.type) {
    case "not_found":
      return `Task not found: ${error.taskId}`;
    case "incomplete_children":
      return `Task has incomplete children: ${error.taskId}`;
    case "validation_error":
      return error.message;
  }
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/tasks", async (request, reply) => {
    const body = parseOrBadRequest(createTaskBodySchema, request.body);
    const result = await tasksService.create(body);
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(201).send(result.value);
  });

  app.patch("/api/tasks/:id/status", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const body = parseOrBadRequest(updateStatusBodySchema, request.body);
    const result = await tasksService.updateStatus(params.id, body.status);
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(200).send(result.value);
  });

  app.post("/api/tasks/:id/children", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const body = parseOrBadRequest(createTaskBodySchema, request.body);
    const result = await tasksService.addChild(params.id, body);
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(201).send(result.value);
  });

  app.post("/api/tasks/:id/split", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const body = parseOrBadRequest(splitBodySchema, request.body);
    const result = await tasksService.splitTask(params.id, body.parts);
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(201).send(result.value);
  });

  app.delete("/api/tasks/:id", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const result = await tasksService.delete(params.id, request.id);
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(204).send();
  });

  app.get("/api/tasks", async (request) => {
    const query = parseOrBadRequest(listQuerySchema, request.query);
    return tasksService.list(query);
  });
}

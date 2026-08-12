// HTTP routes for Tasks (task 3.1 core + task 3.2 hierarchy/split,
// design.md "Backend/tasks" API Contract). Registered into the shared app in
// task 10.3; standalone Fastify plugin here so this module stays testable in
// isolation.
// workspace-resource-scope task 3.1: passes request.currentWorkspaceId into
// TasksService; clients cannot set workspaceId via body.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { tasksService } from "./task.service.js";
import type { TaskError } from "./task.types.js";

const priority = z.enum(["high", "medium", "low"]);
const taskStatus = z.enum(["not_started", "in_progress", "ready_for_handoff", "on_hold"]);

const createTaskBodySchema = z.object({
  title: z.string(),
  priority,
  memo: z.string().optional(),
  caseId: z.string().optional(),
  isRequiredForCase: z.boolean().optional(),
  assigneeUserId: z.string().optional(),
  parentTaskId: z.string().optional(),
});
const updateStatusBodySchema = z.object({ status: taskStatus });
const updateTaskBodySchema = z
  .object({
    title: z.string().optional(),
    priority: priority.optional(),
    memo: z.string().nullable().optional(),
    caseId: z.string().nullable().optional(),
    isRequiredForCase: z.boolean().optional(),
    assigneeUserId: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field must be provided" });
const updateDevelopmentStageBodySchema = z.object({
  developmentStageId: z.string().nullable(),
  assigneeUserId: z.string().optional(),
});
const splitBodySchema = z.object({ parts: z.array(createTaskBodySchema) });
const taskIdParamsSchema = z.object({ id: z.string() });
const listQuerySchema = z.object({
  caseId: z.string().optional(),
  assigneeUserId: z.string().optional(),
  // design.md "Backend/tasks > TasksService.list 未割当フィルタ拡張":
  // z.literal("true") rather than z.coerce.boolean(), since z.coerce.boolean()
  // treats the string "false" as truthy.
  unassignedCase: z.literal("true").optional(),
});

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

function requireCurrentWorkspaceId(request: FastifyRequest): VerifiedWorkspaceId {
  if (!request.currentWorkspaceId) {
    throw badRequest("X-Workspace-Id is required");
  }
  return request.currentWorkspaceId;
}

function taskErrorStatusCode(error: TaskError): number {
  switch (error.type) {
    case "not_found":
      return 404;
    case "incomplete_children":
    case "status_not_applicable":
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
    case "status_not_applicable":
      return `Status not applicable: ${error.taskId}`;
    case "validation_error":
      return error.message;
  }
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/tasks", async (request, reply) => {
    const body = parseOrBadRequest(createTaskBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.create({ ...body, workspaceId });
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(201).send(result.value);
  });

  app.get("/api/tasks/:id", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.getById(params.id, workspaceId);
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(200).send(result.value);
  });

  app.patch("/api/tasks/:id", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const body = parseOrBadRequest(updateTaskBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.update(params.id, workspaceId, body);
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(200).send(result.value);
  });

  app.patch("/api/tasks/:id/status", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const body = parseOrBadRequest(updateStatusBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.updateStatus(params.id, workspaceId, body.status);
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(200).send(result.value);
  });

  app.patch("/api/tasks/:id/development-stage", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const body = parseOrBadRequest(updateDevelopmentStageBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.updateDevelopmentStage(
      params.id,
      workspaceId,
      body.developmentStageId,
      body.assigneeUserId,
    );
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(200).send(result.value);
  });

  app.post("/api/tasks/:id/children", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const body = parseOrBadRequest(createTaskBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.addChild(params.id, workspaceId, { ...body, workspaceId });
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(201).send(result.value);
  });

  app.post("/api/tasks/:id/split", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const body = parseOrBadRequest(splitBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.splitTask(
      params.id,
      workspaceId,
      body.parts.map((part) => ({ ...part, workspaceId })),
    );
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(201).send(result.value);
  });

  app.delete("/api/tasks/:id", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.delete(params.id, workspaceId, request.id);
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(204).send();
  });

  app.get("/api/tasks", async (request) => {
    const query = parseOrBadRequest(listQuerySchema, request.query);
    const workspaceId = requireCurrentWorkspaceId(request);
    return tasksService.list({
      caseId: query.caseId,
      assigneeUserId: query.assigneeUserId,
      unassignedCase: query.unassignedCase === "true",
      workspaceId,
    });
  });
}

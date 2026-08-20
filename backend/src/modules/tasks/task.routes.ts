import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { badRequest } from "../../shared/http-errors.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { activityLogService } from "../activity-logs/activity-log.service.js";
import type { ActivityLogEntry } from "../activity-logs/activity-log.types.js";
import { commentService } from "../comments/comment.service.js";
import type { Comment } from "../comments/comment.types.js";
import { tasksService } from "./task.service.js";
import type { TaskError } from "./task.types.js";

const priority = z.enum(["high", "medium", "low"]);
const taskStatus = z.enum(["not_started", "in_progress", "ready_for_handoff", "on_hold"]);

const storyPoints = z.number().int().min(1);

const createTaskBodySchema = z.object({
  title: z.string(),
  priority,
  detail: z.string().optional(),
  caseId: z.string().optional(),
  isRequiredForCase: z.boolean().optional(),
  assigneeUserId: z.string().optional(),
  parentTaskId: z.string().optional(),
  scheduledEndDate: z.coerce.date().optional(),
  storyPoints: storyPoints.optional(),
});
const updateStatusBodySchema = z.object({ status: taskStatus });
const updateTaskBodySchema = z
  .object({
    title: z.string().optional(),
    priority: priority.optional(),
    detail: z.string().nullable().optional(),
    caseId: z.string().nullable().optional(),
    isRequiredForCase: z.boolean().optional(),
    assigneeUserId: z.string().nullable().optional(),
    parentTaskId: z.string().nullable().optional(),
    scheduledEndDate: z.coerce.date().nullable().optional(),
    storyPoints: storyPoints.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field must be provided" });
const updateDevelopmentStageBodySchema = z.object({
  developmentStageId: z.string().nullable(),
  assigneeUserId: z.string().optional(),
});
const splitBodySchema = z.object({ parts: z.array(createTaskBodySchema) });
const taskIdParamsSchema = z.object({ id: z.string() });
const timelineQuerySchema = z.object({
  filter: z.enum(["all", "comments", "changes"]).default("all"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});
const listQuerySchema = z.object({
  caseId: z.string().optional(),
  assigneeUserId: z.string().optional(),
  titleContains: z.string().optional(),
  excludeSubtreeOf: z.string().optional(),
  excludeClosed: z.literal("true").optional(),
  unassignedCase: z.literal("true").optional(),
});

type TimelineEntry =
  | (Comment & { type: "comment"; occurredAt: Date })
  | (ActivityLogEntry & { type: "change" });

interface TimelineCursor {
  occurredAt: string;
  id: string;
}

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

function compareTimelineEntries(a: TimelineEntry, b: TimelineEntry): number {
  const timeDifference = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (timeDifference !== 0) return timeDifference;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function encodeTimelineCursor(entry: TimelineEntry): string {
  const cursor: TimelineCursor = {
    occurredAt: entry.occurredAt.toISOString(),
    id: entry.id,
  };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeTimelineCursor(encoded: string): TimelineCursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const parsed = z
      .object({
        occurredAt: z.string().datetime(),
        id: z.string().min(1),
      })
      .safeParse(decoded);
    if (!parsed.success) {
      throw new Error("invalid cursor shape");
    }
    return parsed.data;
  } catch {
    throw badRequest("Invalid timeline cursor");
  }
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
    case "deleted_task":
    case "incomplete_children":
    case "status_not_applicable":
    case "closed_task_cannot_take_children":
      return 409;
    case "validation_error":
      return 400;
  }
}

function taskErrorMessage(error: TaskError): string {
  switch (error.type) {
    case "not_found":
      return `Task not found: ${error.taskId}`;
    case "deleted_task":
      return `Task is deleted: ${error.taskId}`;
    case "incomplete_children":
      return `Task has incomplete children: ${error.taskId}`;
    case "status_not_applicable":
      return `Status not applicable: ${error.taskId}`;
    case "closed_task_cannot_take_children":
      return `Closed task cannot take children: ${error.taskId}`;
    case "validation_error":
      return error.message;
  }
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/tasks", async (request, reply) => {
    const body = parseOrBadRequest(createTaskBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.create(
      { ...body, workspaceId },
      { type: "user", userId: request.currentUser!.id },
    );
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(201).send(result.value);
  });

  app.get("/api/tasks/:id", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.getById(params.id, workspaceId, { includeDeleted: true });
    if (!result.ok) {
      reply.status(taskErrorStatusCode(result.error)).send({ error: taskErrorMessage(result.error) });
      return;
    }
    reply.status(200).send(result.value);
  });

  app.get("/api/tasks/:id/timeline", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const query = parseOrBadRequest(timelineQuerySchema, request.query);
    const workspaceId = requireCurrentWorkspaceId(request);
    const task = await tasksService.getById(params.id, workspaceId, { includeDeleted: true });
    if (!task.ok) {
      reply.status(taskErrorStatusCode(task.error)).send({ error: taskErrorMessage(task.error) });
      return;
    }

    const limit = query.limit ?? 20;
    const take = limit + 1;
    const decodedCursor = query.cursor ? decodeTimelineCursor(query.cursor) : undefined;
    const pageQuery = {
      take,
      ...(decodedCursor
        ? { cursor: { occurredAt: new Date(decodedCursor.occurredAt), id: decodedCursor.id } }
        : {}),
    };
    const [comments, changes] = await Promise.all([
      query.filter === "changes" ? Promise.resolve([]) : commentService.list(params.id, pageQuery),
      query.filter === "comments"
        ? Promise.resolve([])
        : activityLogService.listDisplayable(params.id, pageQuery),
    ]);
    const entries: TimelineEntry[] = [
      ...comments.map((comment) => ({
        ...comment,
        type: "comment" as const,
        occurredAt: comment.createdAt,
      })),
      ...changes.map((change) => ({
        ...change,
        type: "change" as const,
      })),
    ].sort(compareTimelineEntries);
    const page = entries.slice(0, take);
    const hasNextPage = page.length > limit;
    const items = hasNextPage ? page.slice(0, limit) : page;

    reply.status(200).send({
      items,
      nextCursor: hasNextPage ? encodeTimelineCursor(items[items.length - 1]) : null,
    });
  });

  app.patch("/api/tasks/:id", async (request, reply) => {
    const params = parseOrBadRequest(taskIdParamsSchema, request.params);
    const body = parseOrBadRequest(updateTaskBodySchema, request.body);
    const workspaceId = requireCurrentWorkspaceId(request);
    const result = await tasksService.update(
      params.id,
      workspaceId,
      body,
      { type: "user", userId: request.currentUser!.id },
    );
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
    const result = await tasksService.updateStatus(
      params.id,
      workspaceId,
      body.status,
      { type: "user", userId: request.currentUser!.id },
    );
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
      { type: "user", userId: request.currentUser!.id },
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
    const result = await tasksService.addChild(
      params.id,
      workspaceId,
      { ...body, workspaceId },
      { type: "user", userId: request.currentUser!.id },
    );
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
      { type: "user", userId: request.currentUser!.id },
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
    const result = await tasksService.delete(
      params.id,
      workspaceId,
      { type: "user", userId: request.currentUser!.id },
      request.id,
    );
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
      titleContains: query.titleContains,
      excludeSubtreeOf: query.excludeSubtreeOf,
      excludeClosed: query.excludeClosed === "true",
      unassignedCase: query.unassignedCase === "true",
      workspaceId,
    });
  });
}

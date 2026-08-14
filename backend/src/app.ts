// Fastify instance creation and route registration (task 10.3, Requirements
// 10.1, 10.3, 10.5, 10.6).
//
// Access logging, business-event logging, and global error handling all go
// through shared/logger.ts (task 1.5, design.md "Backend/shared(Logging
// Infrastructure)") rather than Fastify's built-in pino integration, so the
// log shape stays identical whether it's emitted from this hook, a route, or
// a Service. Fastify's own logger is disabled (`logger: false`) to avoid
// double-logging every request; `request.id` (always populated by Fastify
// core regardless of the logger setting) remains the correlation key.
//
// Every module's routes are Fastify plugins with no shared state of their
// own (task 2.1-9.3 built and tested each in isolation), so registration
// here is just wiring; `setErrorHandler` below already applies uniformly to
// every registered route since it is a single Fastify instance.
import cors from "@fastify/cors";
import csrfProtection from "@fastify/csrf-protection";
import secureSession from "@fastify/secure-session";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { loadEnv, type Env } from "./config/env.js";
import { createLogger, type AppLogger } from "./shared/logger.js";
import { requireUser } from "./modules/auth/auth.guard.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { taskRoutes } from "./modules/tasks/task.routes.js";
import { commentRoutes } from "./modules/comments/comment.routes.js";
import { caseRoutes } from "./modules/cases/case.routes.js";
import { holidayRoutes } from "./modules/holidays/holiday.routes.js";
import { throughputRoutes } from "./modules/throughput/throughput.routes.js";
import { recurrenceRoutes } from "./modules/recurrence/recurrence.routes.js";
import { clientErrorRoutes } from "./modules/client-errors/client-error.routes.js";
import { developmentStageRoutes } from "./modules/development-stages/development-stage.routes.js";
import { workspaceRoutes } from "./modules/workspaces/workspace.routes.js";
import { requireWorkspaceMember } from "./workspace-scope.guard.js";

const WORKSPACE_SCOPED_PATH_PREFIXES = [
  "/api/cases",
  "/api/tasks",
  "/api/recurring-templates",
  "/api/holidays",
  "/api/development-stages",
  "/api/throughput",
] as const;

function isWorkspaceScopedPath(path: string): boolean {
  return WORKSPACE_SCOPED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function buildApp(env: Env = loadEnv(), logger: AppLogger = createLogger(env.LOG_LEVEL)): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  app.register(secureSession, {
    cookieName: "session",
    key: Buffer.from(env.SESSION_SECRET, "hex"),
    expiry: 7 * 24 * 60 * 60,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
    },
  });
  app.register(csrfProtection, { sessionPlugin: "@fastify/secure-session" });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.addHook("onResponse", async (request, reply) => {
    logger.logAccess(request.id, request.method, request.url, reply.statusCode, reply.elapsedTime);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    logger.logError(error, { requestId: request.id });
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    reply.status(statusCode).send({
      error: statusCode === 500 ? "Internal Server Error" : error.message,
    });
  });

  app.addHook("onRequest", (request, reply, done) => {
    const path = request.routeOptions.url ?? "";
    const isCsrfExempt =
      path === "/health" ||
      path === "/api/auth/register" ||
      path === "/api/auth/login" ||
      path === "/api/auth/csrf";
    if (isCsrfExempt || !["POST", "PATCH", "DELETE"].includes(request.method)) {
      done();
      return;
    }
    app.csrfProtection(request, reply, done);
  });

  app.addHook("preHandler", async (request) => {
    const path = request.routeOptions.url ?? "";
    const isRequireUserExempt =
      path === "/health" ||
      path === "/api/auth/register" ||
      path === "/api/auth/login" ||
      path === "/api/auth/csrf" ||
      path === "/api/client-errors";
    if (path.startsWith("/api/") && !isRequireUserExempt) {
      await requireUser(request);
    }
  });

  app.addHook("preHandler", async (request) => {
    const path = request.routeOptions.url ?? "";
    if (isWorkspaceScopedPath(path)) {
      await requireWorkspaceMember(request);
    }
  });

  app.register(authRoutes);
  app.register(userRoutes);
  app.register(taskRoutes);
  app.register(commentRoutes);
  app.register(caseRoutes);
  app.register(holidayRoutes);
  app.register(throughputRoutes);
  app.register(recurrenceRoutes);
  app.register(clientErrorRoutes);
  app.register(developmentStageRoutes);
  app.register(workspaceRoutes);

  return app;
}

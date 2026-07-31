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
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { loadEnv, type Env } from "./config/env.js";
import { createLogger, type AppLogger } from "./shared/logger.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { taskRoutes } from "./modules/tasks/task.routes.js";
import { deliveryRoutes } from "./modules/deliveries/delivery.routes.js";
import { eventRoutes } from "./modules/events/event.routes.js";
import { holidayRoutes } from "./modules/holidays/holiday.routes.js";
import { throughputRoutes } from "./modules/throughput/throughput.routes.js";
import { recurrenceRoutes } from "./modules/recurrence/recurrence.routes.js";
import { clientErrorRoutes } from "./modules/client-errors/client-error.routes.js";
import { developmentStageRoutes } from "./modules/development-stages/development-stage.routes.js";

export function buildApp(env: Env = loadEnv(), logger: AppLogger = createLogger(env.LOG_LEVEL)): FastifyInstance {
  const app = Fastify({ logger: false });

  // The SPA (ssr: false, task 1.6) calls this API directly from the
  // browser, and frontend/backend run on different origins even in local
  // dev (separate docker-compose services/ports) — found missing during
  // task 11.x's real browser verification (curl/app.inject same-origin
  // calls never exercise this). This is a lightweight, no-auth internal
  // tool (product.md), so reflecting the request's own Origin rather than
  // maintaining an allowlist is an acceptable, low-risk default.
  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

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

  app.register(userRoutes);
  app.register(taskRoutes);
  app.register(deliveryRoutes);
  app.register(eventRoutes);
  app.register(holidayRoutes);
  app.register(throughputRoutes);
  app.register(recurrenceRoutes);
  app.register(clientErrorRoutes);
  app.register(developmentStageRoutes);

  return app;
}

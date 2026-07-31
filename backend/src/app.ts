// Fastify instance creation and route registration (Requirements: 10.6).
//
// Access logging, business-event logging, and global error handling all go
// through shared/logger.ts (task 1.5, design.md "Backend/shared(Logging
// Infrastructure)") rather than Fastify's built-in pino integration, so the
// log shape stays identical whether it's emitted from this hook, a route, or
// a Service. Fastify's own logger is disabled (`logger: false`) to avoid
// double-logging every request; `request.id` (always populated by Fastify
// core regardless of the logger setting) remains the correlation key.
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { loadEnv, type Env } from "./config/env.js";
import { createLogger, type AppLogger } from "./shared/logger.js";

export function buildApp(env: Env = loadEnv(), logger: AppLogger = createLogger(env.LOG_LEVEL)): FastifyInstance {
  const app = Fastify({ logger: false });

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

  return app;
}

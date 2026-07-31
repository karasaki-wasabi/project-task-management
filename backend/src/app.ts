// Fastify instance creation and route registration (Requirements: 10.6).
//
// Scope for task 1.2: bootstrap the app, read DATABASE_URL/LOG_LEVEL from the
// environment, and expose GET /health. Global error handling + business/access
// logging via shared/logger.ts is built in task 1.5 and wired into this file
// then (see design.md "Backend/shared(Logging Infrastructure)") — this file is
// deliberately kept small so that later work extends it rather than reshapes it.
import Fastify, { type FastifyInstance } from "fastify";
import { loadEnv, type Env } from "./config/env.js";

export function buildApp(env: Env = loadEnv()): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}

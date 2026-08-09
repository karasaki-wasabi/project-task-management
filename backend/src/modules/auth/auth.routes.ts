import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { badRequest, unauthorized } from "../../shared/http-errors.js";
import { authService } from "./auth.service.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    userId?: string;
  }
}

declare module "fastify" {
  interface FastifyReply {
    generateCsrf(): string;
  }
}

const registerBodySchema = z.object({
  email: z.string(),
  name: z.string(),
  password: z.string(),
});

const loginBodySchema = z.object({
  email: z.string(),
  password: z.string(),
});

function parseOrBadRequest<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
}

function establishSession(request: FastifyRequest, userId: string): void {
  request.session.set("userId", userId);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/register", async (request, reply) => {
    const body = parseOrBadRequest(registerBodySchema, request.body);
    const user = await authService.register(body);
    establishSession(request, user.id);
    reply.status(201).send(user);
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = parseOrBadRequest(loginBodySchema, request.body);
    const user = await authService.login(body);
    establishSession(request, user.id);
    reply.send(user);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    request.session.delete();
    reply.status(204).send();
  });

  app.get("/api/auth/me", async (request) => {
    const userId = request.session.get("userId");
    if (!userId) {
      throw unauthorized("ログインが必要です。");
    }

    const user = await authService.getPublicUser(userId);
    if (!user) {
      request.session.delete();
      throw unauthorized("ログインが必要です。");
    }
    return user;
  });

  app.get("/api/auth/csrf", async (_request, reply: FastifyReply) => {
    return { token: reply.generateCsrf() };
  });
}

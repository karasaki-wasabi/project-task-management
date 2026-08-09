import type { FastifyRequest } from "fastify";
import { unauthorized } from "../../shared/http-errors.js";
import { authService } from "./auth.service.js";
import type { PublicUser } from "./auth.types.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: PublicUser;
  }
}

export async function requireUser(request: FastifyRequest): Promise<void> {
  const userId = request.session.get<unknown>("userId");
  if (typeof userId !== "string" || userId.length === 0) {
    request.session.delete();
    throw unauthorized("ログインが必要です。");
  }

  const user = await authService.getPublicUser(userId);
  if (!user) {
    request.session.delete();
    throw unauthorized("ログインが必要です。");
  }

  request.currentUser = user;
}

import type { FastifyInstance } from "fastify";
import { usersService } from "./user.service.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/users", async (request) => {
    const q = (request.query as { q?: unknown }).q;
    if (typeof q !== "string" || q === "") {
      return usersService.list();
    }
    return usersService.search(q);
  });
}

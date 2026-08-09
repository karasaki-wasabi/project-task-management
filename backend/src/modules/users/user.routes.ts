import type { FastifyInstance } from "fastify";
import { usersService } from "./user.service.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/users", async () => {
    return usersService.list();
  });
}

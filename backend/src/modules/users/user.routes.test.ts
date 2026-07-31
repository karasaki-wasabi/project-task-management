// RED: userRoutes does not exist yet (task 2.1). Route registration into the
// main app.ts happens in task 10.3 (design.md "Integration"); this test
// mounts the plugin on a throwaway Fastify instance to verify the module in
// isolation, matching the pattern task 10.3 will reuse.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { userRoutes } from "./user.routes.js";

async function hardDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(userRoutes);
  return app;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("userRoutes (task 2.1)", () => {
  it("POST /api/users creates a user and returns 201", async () => {
    const app = await buildTestApp();
    const name = `route-${randomUUID()}`;

    const response = await app.inject({ method: "POST", url: "/api/users", payload: { name } });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe(name);

    await hardDelete([body.id]);
    await app.close();
  });

  it("POST /api/users returns 400 for an empty name", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "POST", url: "/api/users", payload: { name: "" } });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/users lists users and excludes deleted ones", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: `list-${randomUUID()}` },
    });
    const { id } = created.json();

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/users/${id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/users" });
    expect(listResponse.statusCode).toBe(200);
    const list = listResponse.json();
    expect(list.some((u: { id: string }) => u.id === id)).toBe(false);

    await hardDelete([id]);
    await app.close();
  });

  it("DELETE /api/users/:id returns 404 for a non-existent user", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/users/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

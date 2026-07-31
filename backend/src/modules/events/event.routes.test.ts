// RED: eventRoutes does not exist yet (task 5.1). Registration into the main
// app.ts happens in task 10.3; this test mounts the plugin on a throwaway
// Fastify instance.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { eventRoutes } from "./event.routes.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(eventRoutes);
  return app;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("eventRoutes (task 5.1)", () => {
  it("POST /api/events creates an event and returns 201", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/events",
      payload: { title: "route event", occursAt: "2026-09-01T10:00:00.000Z" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe("route event");
    expect(body).not.toHaveProperty("status");

    await hardDelete("events", [body.id]);
    await app.close();
  });

  it("POST /api/events returns 400 for an empty title", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/events",
      payload: { title: "", occursAt: "2026-09-01T10:00:00.000Z" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/events lists events, supports assigneeUserId filter, and excludes deleted ones", async () => {
    const app = await buildTestApp();
    const userResponse = await db.user.create({ data: { name: `u-${randomUUID()}` } });
    const created = await app.inject({
      method: "POST",
      url: "/api/events",
      payload: { title: "filterable", occursAt: "2026-09-01T10:00:00.000Z", assigneeUserId: userResponse.id },
    });
    const { id } = created.json();

    const filteredResponse = await app.inject({ method: "GET", url: `/api/events?assigneeUserId=${userResponse.id}` });
    expect(filteredResponse.statusCode).toBe(200);
    expect(filteredResponse.json().map((e: { id: string }) => e.id)).toEqual([id]);

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/events/${id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/events" });
    expect(listResponse.json().some((e: { id: string }) => e.id === id)).toBe(false);

    await hardDelete("events", [id]);
    await hardDelete("users", [userResponse.id]);
    await app.close();
  });

  it("DELETE /api/events/:id returns 404 for a non-existent event", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/events/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

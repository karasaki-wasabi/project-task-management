// RED: deliveryRoutes does not exist yet (task 4.1). Registration into the
// main app.ts happens in task 10.3; this test mounts the plugin on a
// throwaway Fastify instance.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { deliveryRoutes } from "./delivery.routes.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(deliveryRoutes);
  return app;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("deliveryRoutes (task 4.1)", () => {
  it("POST /api/deliveries creates a delivery and returns 201", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/deliveries",
      payload: { name: "route delivery", dueDate: "2026-09-01T00:00:00.000Z" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe("route delivery");

    await hardDelete("deliveries", [body.id]);
    await app.close();
  });

  it("POST /api/deliveries returns 400 for an empty name", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/deliveries",
      payload: { name: "", dueDate: "2026-09-01T00:00:00.000Z" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("PATCH /api/deliveries/:id updates dueDate, returns 404 for unknown id", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/deliveries",
      payload: { name: "patchable", dueDate: "2026-09-01T00:00:00.000Z" },
    });
    const { id } = created.json();

    const okResponse = await app.inject({
      method: "PATCH",
      url: `/api/deliveries/${id}`,
      payload: { dueDate: "2026-12-25T00:00:00.000Z" },
    });
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json().dueDate).toContain("2026-12-25");

    const missingResponse = await app.inject({
      method: "PATCH",
      url: `/api/deliveries/${randomUUID()}`,
      payload: { dueDate: "2026-12-25T00:00:00.000Z" },
    });
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete("deliveries", [id]);
    await app.close();
  });

  it("GET /api/deliveries/:id/progress returns progress, and 404 for unknown id", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/deliveries",
      payload: { name: "progress route", dueDate: "2026-09-01T00:00:00.000Z" },
    });
    const { id } = created.json();

    const response = await app.inject({ method: "GET", url: `/api/deliveries/${id}/progress` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      requiredTotal: 0,
      requiredCompleted: 0,
      requiredIncomplete: 0,
      isOverdueWithIncomplete: false,
    });

    const missingResponse = await app.inject({ method: "GET", url: `/api/deliveries/${randomUUID()}/progress` });
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete("deliveries", [id]);
    await app.close();
  });

  it("GET /api/deliveries lists deliveries and excludes deleted ones", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/deliveries",
      payload: { name: "listable", dueDate: "2026-09-01T00:00:00.000Z" },
    });
    const { id } = created.json();

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/deliveries/${id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/deliveries" });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().some((d: { id: string }) => d.id === id)).toBe(false);

    await hardDelete("deliveries", [id]);
    await app.close();
  });

  it("DELETE /api/deliveries/:id returns 404 for a non-existent delivery", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/deliveries/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

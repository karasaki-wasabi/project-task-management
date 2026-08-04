// RED: caseRoutes does not exist yet (task 3.3, design.md "Backend/cases"
// API Contract). Registration into the main app.ts happens in this same
// task; this test mounts the plugin on a throwaway Fastify instance,
// mirroring the retired deliveries/delivery.routes.test.ts (task 4.1) which
// this replaces.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { caseRoutes } from "./case.routes.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(caseRoutes);
  return app;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("caseRoutes (task 3.3)", () => {
  it("POST /api/cases creates a case and returns 201", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: { name: "route case", endDate: "2026-09-01T00:00:00.000Z" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe("route case");
    expect(body.isCompleted).toBe(false);

    await hardDelete("cases", [body.id]);
    await app.close();
  });

  it("POST /api/cases returns 400 when startDate is later than endDate", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: {
        name: "invalid range",
        startDate: "2026-09-10T00:00:00.000Z",
        endDate: "2026-09-01T00:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("PATCH /api/cases/:id updates isCompleted independently, and returns 404 for unknown id", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: { name: "patchable", endDate: "2026-09-01T00:00:00.000Z" },
    });
    const { id } = created.json();

    const okResponse = await app.inject({
      method: "PATCH",
      url: `/api/cases/${id}`,
      payload: { isCompleted: true },
    });
    expect(okResponse.statusCode).toBe(200);
    const body = okResponse.json();
    expect(body.isCompleted).toBe(true);
    expect(body.name).toBe("patchable");

    const missingResponse = await app.inject({
      method: "PATCH",
      url: `/api/cases/${randomUUID()}`,
      payload: { isCompleted: true },
    });
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete("cases", [id]);
    await app.close();
  });

  it("GET /api/cases/:id/progress returns progress, and 404 for unknown id", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: { name: "progress route", endDate: "2026-09-01T00:00:00.000Z" },
    });
    const { id } = created.json();

    const response = await app.inject({ method: "GET", url: `/api/cases/${id}/progress` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      requiredTotal: 0,
      requiredCompleted: 0,
      requiredIncomplete: 0,
      isOverdueWithIncomplete: false,
    });

    const missingResponse = await app.inject({ method: "GET", url: `/api/cases/${randomUUID()}/progress` });
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete("cases", [id]);
    await app.close();
  });

  it("GET /api/cases lists cases and excludes deleted ones", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: { name: "listable", endDate: "2026-09-01T00:00:00.000Z" },
    });
    const { id } = created.json();

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/cases/${id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/cases" });
    expect(listResponse.statusCode).toBe(200);
    expect(Array.isArray(listResponse.json())).toBe(true);
    expect(listResponse.json().some((c: { id: string }) => c.id === id)).toBe(false);

    await hardDelete("cases", [id]);
    await app.close();
  });

  it("DELETE /api/cases/:id returns 404 for a non-existent case", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/cases/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

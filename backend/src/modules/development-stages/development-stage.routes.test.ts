// RED: developmentStageRoutes does not exist yet (task 14.1). Registration
// into the main app.ts happens in task 16.1; this test mounts the plugin on
// a throwaway Fastify instance.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { developmentStageRoutes } from "./development-stage.routes.js";

async function hardDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM development_stages WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(developmentStageRoutes);
  return app;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("developmentStageRoutes (task 14.1)", () => {
  it("POST /api/development-stages registers a stage and returns 201", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/development-stages",
      payload: { name: "spec-tbd" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().name).toBe("spec-tbd");

    await hardDelete([response.json().id]);
    await app.close();
  });

  it("POST /api/development-stages returns 400 for an empty name", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "POST", url: "/api/development-stages", payload: { name: "" } });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("PATCH /api/development-stages/:id renames a stage", async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/development-stages",
      payload: { name: "before" },
    });
    const { id } = created.json();

    const response = await app.inject({ method: "PATCH", url: `/api/development-stages/${id}`, payload: { name: "after" } });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("after");

    await hardDelete([id]);
    await app.close();
  });

  it("POST /api/development-stages/reorder updates the order", async () => {
    const app = await buildTestApp();
    const a = (await app.inject({ method: "POST", url: "/api/development-stages", payload: { name: "a" } })).json();
    const b = (await app.inject({ method: "POST", url: "/api/development-stages", payload: { name: "b" } })).json();
    // reorder requires orderedIds to contain exactly the current set of
    // stages (design.md precondition) — this DB can already have other
    // stages (seed/demo data), so include them too; a/b first keeps the
    // "did these two swap to the front" assertion below meaningful.
    const existing = (await app.inject({ method: "GET", url: "/api/development-stages" })).json();
    const others = existing.map((s: { id: string }) => s.id).filter((id: string) => id !== a.id && id !== b.id);

    const response = await app.inject({
      method: "POST",
      url: "/api/development-stages/reorder",
      payload: { orderedIds: [b.id, a.id, ...others] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().slice(0, 2).map((s: { id: string }) => s.id)).toEqual([b.id, a.id]);

    await hardDelete([a.id, b.id]);
    await app.close();
  });

  it("GET /api/development-stages lists stages and excludes removed ones", async () => {
    const app = await buildTestApp();
    const created = await app.inject({ method: "POST", url: "/api/development-stages", payload: { name: "removable" } });
    const { id } = created.json();

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/development-stages/${id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/development-stages" });
    expect(listResponse.json().some((s: { id: string }) => s.id === id)).toBe(false);

    await hardDelete([id]);
    await app.close();
  });

  it("DELETE /api/development-stages/:id returns 404 for a non-existent stage", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/development-stages/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

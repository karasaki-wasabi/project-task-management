// RED: holidayRoutes does not exist yet (task 6.1). `/api/holidays/sync` is
// added in task 6.2. Registration into the main app.ts happens in task
// 10.3; this test mounts the plugin on a throwaway Fastify instance.
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../shared/db.js";
import { holidayRoutes } from "./holiday.routes.js";

async function hardDelete(dates: string[]): Promise<void> {
  if (dates.length === 0) return;
  await db.$executeRawUnsafe(
    `DELETE FROM non_business_days WHERE date IN (${dates.map(() => "?").join(",")})`,
    ...dates,
  );
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(holidayRoutes);
  return app;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("holidayRoutes (task 6.1)", () => {
  it("POST /api/holidays registers a non-business day and returns 201", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/holidays",
      payload: { date: "2032-01-01", label: "元日" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().date).toBe("2032-01-01");

    await hardDelete(["2032-01-01"]);
    await app.close();
  });

  it("POST /api/holidays returns 409 for a duplicate active date", async () => {
    const app = await buildTestApp();
    await app.inject({ method: "POST", url: "/api/holidays", payload: { date: "2032-01-02" } });

    const response = await app.inject({ method: "POST", url: "/api/holidays", payload: { date: "2032-01-02" } });

    expect(response.statusCode).toBe(409);

    await hardDelete(["2032-01-02"]);
    await app.close();
  });

  it("POST /api/holidays returns 400 for an invalid date", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "POST", url: "/api/holidays", payload: { date: "bogus" } });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/holidays lists holidays and excludes removed ones", async () => {
    const app = await buildTestApp();
    const created = await app.inject({ method: "POST", url: "/api/holidays", payload: { date: "2032-01-03" } });
    const { id } = created.json();

    const deleteResponse = await app.inject({ method: "DELETE", url: `/api/holidays/${id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: "GET", url: "/api/holidays" });
    expect(listResponse.json().some((h: { id: string }) => h.id === id)).toBe(false);

    await hardDelete(["2032-01-03"]);
    await app.close();
  });

  it("DELETE /api/holidays/:id returns 404 for a non-existent holiday", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/holidays/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

// RED: POST /api/holidays/sync does not exist yet (task 6.2). global.fetch
// is stubbed rather than hitting the real external API from tests.
describe("holidayRoutes sync (task 6.2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POST /api/holidays/sync adds new holidays returned by the external API", async () => {
    const date = "2033-02-11";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ [date]: "建国記念の日" }) })),
    );
    const app = await buildTestApp();

    const response = await app.inject({ method: "POST", url: "/api/holidays/sync" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.skippedExisting).toBe(0);
    expect(body.added.map((h: { date: string }) => h.date)).toContain(date);

    await hardDelete([date]);
    await app.close();
  });

  it("POST /api/holidays/sync returns 502 and leaves the master unchanged when the external API fails", async () => {
    const survivor = "2033-03-03";
    const seedApp = await buildTestApp();
    await seedApp.inject({ method: "POST", url: "/api/holidays", payload: { date: survivor } });
    await seedApp.close();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    const app = await buildTestApp();

    const response = await app.inject({ method: "POST", url: "/api/holidays/sync" });

    expect(response.statusCode).toBe(502);

    const listResponse = await app.inject({ method: "GET", url: "/api/holidays" });
    expect(listResponse.json().some((h: { date: string }) => h.date === survivor)).toBe(true);

    await hardDelete([survivor]);
    await app.close();
  });
});

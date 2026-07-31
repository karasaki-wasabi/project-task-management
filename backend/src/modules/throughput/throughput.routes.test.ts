// RED: throughputRoutes does not exist yet (task 7.1). Registration into the
// main app.ts happens in task 10.3; this test mounts the plugin on a
// throwaway Fastify instance.
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { throughputRoutes } from "./throughput.routes.js";

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(throughputRoutes);
  return app;
}

afterAll(async () => {
  await db.$disconnect();
});

describe("throughputRoutes (task 7.1)", () => {
  it("GET /api/throughput returns a summary for valid query params", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/throughput?periodType=week&rangeCount=2" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.periods).toHaveLength(2);
    expect(body).toHaveProperty("forecastNextPeriodCount");

    await app.close();
  });

  it("GET /api/throughput returns 400 for an invalid periodType", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/throughput?periodType=day&rangeCount=1" });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/throughput returns 400 for rangeCount < 1", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/throughput?periodType=week&rangeCount=0" });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

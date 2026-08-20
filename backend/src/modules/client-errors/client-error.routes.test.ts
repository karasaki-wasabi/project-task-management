import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { clientErrorRoutes } from "./client-error.routes.js";

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(clientErrorRoutes);
  return app;
}

describe("clientErrorRoutes (task 8.1)", () => {
  it("POST /api/client-errors で有効なレポートを受け取り、204 を返す", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/client-errors",
      payload: {
        message: "ReferenceError: x is not defined",
        stack: "ReferenceError: x is not defined\n  at Component.vue:5:1",
        pageUrl: "https://app.example.com/deliveries",
        occurredAt: "2026-08-01T09:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(204);
    await app.close();
  });

  it("POST /api/client-errors で message がない場合、400 を返す", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/client-errors",
      payload: { pageUrl: "https://app.example.com/", occurredAt: "2026-08-01T09:00:00.000Z" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("POST /api/client-errors で pageUrl がない場合、400 を返す", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/client-errors",
      payload: { message: "boom", occurredAt: "2026-08-01T09:00:00.000Z" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

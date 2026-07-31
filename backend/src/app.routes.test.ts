// RED: buildApp() does not register any module routes yet (task 10.3,
// Requirements 10.1, 10.3, 10.5). Confirms every module's routes are wired
// into the shared app, the global error handler applies uniformly, and
// access/business-event/error logs all correlate via the same requestId
// for both a success and a failure flow through the full app.
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createLogger } from "./shared/logger.js";
import { setBusinessEventLoggerForTests } from "./shared/business-event-logger.js";
import { db } from "./shared/db.js";

function collectingStream() {
  const lines: Record<string, unknown>[] = [];
  let buffer = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) lines.push(JSON.parse(line));
      }
      callback();
    },
  });
  return { stream, lines };
}

function buildTestApp() {
  const { stream, lines } = collectingStream();
  const logger = createLogger("debug", stream);
  setBusinessEventLoggerForTests(logger);
  const app = buildApp(
    { DATABASE_URL: "mysql://user:pass@localhost:3306/db", LOG_LEVEL: "debug", PORT: 3000 },
    logger,
  );
  return { app, lines };
}

const createdDeliveryIds: string[] = [];

afterEach(async () => {
  if (createdDeliveryIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM deliveries WHERE id IN (${createdDeliveryIds.map(() => "?").join(",")})`,
      ...createdDeliveryIds,
    );
    createdDeliveryIds.length = 0;
  }
  await db.$disconnect();
});

describe("app.ts route registration (task 10.3)", () => {
  it.each([
    ["/api/users", "GET"],
    ["/api/tasks", "GET"],
    ["/api/deliveries", "GET"],
    ["/api/events", "GET"],
    ["/api/holidays", "GET"],
    ["/api/throughput?periodType=week&rangeCount=1", "GET"],
    ["/api/recurring-templates", "GET"],
  ] as const)("%s is registered and reachable (not 404)", async (url, method) => {
    const { app } = buildTestApp();

    const response = await app.inject({ method, url });

    expect(response.statusCode).not.toBe(404);
    await app.close();
  });

  it("POST /api/client-errors is registered and reachable", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/client-errors",
      payload: { message: "boom", pageUrl: "https://app.example.com/", occurredAt: new Date().toISOString() },
    });

    expect(response.statusCode).not.toBe(404);
    await app.close();
  });

  it("the global error handler applies uniformly: a business HttpError from any module route returns its statusCode as JSON, not a raw 500", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/users/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toHaveProperty("error");
    await app.close();
  });

  it("a full success flow correlates access log + business event log under the same requestId (Requirements 10.1, 10.2, 10.5)", async () => {
    const { app, lines } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/deliveries",
      payload: { name: `route-check-${randomUUID()}`, dueDate: "2038-01-01T00:00:00.000Z" },
    });

    expect(response.statusCode).toBe(201);
    createdDeliveryIds.push(response.json().id);

    const accessLine = lines.find((l) => l.path === "/api/deliveries" && l.statusCode === 201);
    const businessLine = lines.find((l) => l.event === "delivery.created");
    expect(accessLine).toBeTruthy();
    expect(businessLine).toBeTruthy();
    expect(businessLine?.requestId).toBe(accessLine?.requestId);
    expect(businessLine?.entityId).toBe(response.json().id);

    await app.close();
  });

  it("a full failure flow (thrown HttpError -> global error handler) correlates access log + error log under the same requestId (Requirements 10.1, 10.3, 10.5)", async () => {
    const { app, lines } = buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/users/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    const accessLine = lines.find((l) => l.path?.toString().startsWith("/api/users/") && l.statusCode === 404);
    const errorLine = lines.find((l) => l.err !== undefined);
    expect(accessLine).toBeTruthy();
    expect(errorLine).toBeTruthy();
    expect(errorLine?.requestId).toBe(accessLine?.requestId);

    await app.close();
  });
});

// RED: CORS is not configured yet. Found via real cross-origin browser
// testing (task 11.x): the SPA (ssr: false) calls the API directly from the
// browser, and the frontend/backend containers run on different ports/
// origins even in local dev — without CORS headers, every browser-originated
// API call fails with a generic network error (no HTTP status at all),
// invisible to any test that calls the API directly (curl, `app.inject`,
// same-origin fetch) rather than through an actual cross-origin browser
// request. This was undetected until this task's Playwright verification.
describe("app.ts CORS (found and fixed during task 11.x frontend integration)", () => {
  it("responds to a cross-origin GET with an Access-Control-Allow-Origin header reflecting the request's Origin", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { origin: "http://localhost:13021" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:13021");

    await app.close();
  });

  it("responds to a CORS preflight OPTIONS request for a state-changing route", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/users",
      headers: {
        origin: "http://localhost:13021",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.statusCode).toBeLessThan(300);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:13021");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");

    await app.close();
  });
});

// RED: buildApp() does not register any module routes yet (task 10.3,
// Requirements 10.1, 10.3, 10.5). Confirms every module's routes are wired
// into the shared app, the global error handler applies uniformly, and
// access/business-event/error logs all correlate via the same requestId
// for both a success and a failure flow through the full app.
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { InjectOptions } from "light-my-request";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createLogger } from "./shared/logger.js";
import { setBusinessEventLoggerForTests } from "./shared/business-event-logger.js";
import { db } from "./shared/db.js";
import { WORKSPACE_HEADER_NAME } from "./shared/workspace-scope.js";

const WORKSPACE_SCOPED_PREFIXES = [
  "/api/cases",
  "/api/tasks",
  "/api/recurring-templates",
  "/api/holidays",
  "/api/development-stages",
] as const;

function needsWorkspaceHeader(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return WORKSPACE_SCOPED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

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

function withAuthenticatedInject(app: ReturnType<typeof buildApp>) {
  const originalInject = app.inject.bind(app);
  let auth: Promise<{ cookie: string; csrfToken: string; userId: string; workspaceId: string }> | undefined;

  async function authenticate() {
    auth ??= (async () => {
      const registerResponse = await originalInject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: `app-routes-${randomUUID()}@example.test`,
          name: "ルート検証",
          password: "password-123",
        },
      });
      const setCookie = registerResponse.headers["set-cookie"];
      const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((item) => item?.startsWith("session="))?.split(";")[0];
      if (!cookie) throw new Error("session cookie was not set");

      const csrfResponse = await originalInject({
        method: "GET",
        url: "/api/auth/csrf",
        headers: { cookie },
      });
      const csrfSetCookie = csrfResponse.headers["set-cookie"];
      const csrfCookie = (Array.isArray(csrfSetCookie) ? csrfSetCookie : [csrfSetCookie]).find((item) => item?.startsWith("session="))?.split(";")[0];
      const sessionCookie = csrfCookie ?? cookie;
      const csrfToken = csrfResponse.json().token as string;

      const workspaceResponse = await originalInject({
        method: "POST",
        url: "/api/workspaces",
        headers: { cookie: sessionCookie, "csrf-token": csrfToken },
        payload: { name: `app-routes-ws-${randomUUID()}` },
      });
      if (workspaceResponse.statusCode !== 201) {
        throw new Error(`failed to create workspace for app.routes tests: ${workspaceResponse.statusCode}`);
      }

      return {
        cookie: sessionCookie,
        csrfToken,
        userId: registerResponse.json().id as string,
        workspaceId: workspaceResponse.json().id as string,
      };
    })();
    return auth;
  }

  app.inject = (async (options: InjectOptions) => {
    if (options.method === "OPTIONS" || options.url.startsWith("/api/auth/")) return originalInject(options);

    const { cookie, csrfToken, workspaceId } = await authenticate();
    const url = typeof options.url === "string" ? options.url : String(options.url);
    return originalInject({
      ...options,
      headers: {
        ...options.headers,
        cookie: options.headers?.cookie ? `${options.headers.cookie}; ${cookie}` : cookie,
        ...(options.method === "POST" || options.method === "PATCH" || options.method === "DELETE" ? { "csrf-token": csrfToken } : {}),
        ...(needsWorkspaceHeader(url) && !options.headers?.[WORKSPACE_HEADER_NAME]
          ? { [WORKSPACE_HEADER_NAME]: workspaceId }
          : {}),
      },
    });
  }) as typeof app.inject;

  app.addHook("onClose", async () => {
    const authenticated = await auth;
    if (!authenticated) return;
    await db.$executeRawUnsafe(`DELETE FROM tasks WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(
      `DELETE FROM recurring_task_templates WHERE workspace_id = ?`,
      authenticated.workspaceId,
    );
    await db.$executeRawUnsafe(`DELETE FROM non_business_days WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM development_stages WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM cases WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM workspace_members WHERE workspace_id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM workspaces WHERE id = ?`, authenticated.workspaceId);
    await db.$executeRawUnsafe(`DELETE FROM users WHERE id = ?`, authenticated.userId);
  });
  return app;
}

function buildTestApp() {
  const { stream, lines } = collectingStream();
  const logger = createLogger("debug", stream);
  setBusinessEventLoggerForTests(logger);
  const app = buildApp(
    {
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      CORS_ORIGIN: "http://localhost:3001",
      COOKIE_SECURE: false,
      LOG_LEVEL: "debug",
      PORT: 3000,
    },
    logger,
  );
  return { app: withAuthenticatedInject(app), lines };
}

const createdCaseIds: string[] = [];

afterEach(async () => {
  if (createdCaseIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM cases WHERE id IN (${createdCaseIds.map(() => "?").join(",")})`,
      ...createdCaseIds,
    );
    createdCaseIds.length = 0;
  }
  await db.$disconnect();
});

describe("app.ts route registration (task 10.3)", () => {
  it.each([
    ["/api/users", "GET"],
    ["/api/tasks", "GET"],
    ["/api/cases", "GET"],
    ["/api/holidays", "GET"],
    ["/api/throughput?periodType=week&rangeCount=1", "GET"],
    ["/api/recurring-templates", "GET"],
    ["/api/development-stages", "GET"],
    ["/api/workspaces", "GET"],
  ] as const)("%s is registered and reachable (not 404)", async (url, method) => {
    const { app } = buildTestApp();

    const response = await app.inject({ method, url });

    expect(response.statusCode).not.toBe(404);
    await app.close();
  });

  it("PATCH /api/tasks/:id/development-stage is registered and reachable (task 16.1)", async () => {
    const { app } = buildTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "route-check task", priority: "low" },
    });
    const taskId = created.json().id;

    const response = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${taskId}/development-stage`,
      payload: { developmentStageId: null },
    });

    expect(response.statusCode).toBe(200);

    await db.$executeRawUnsafe(`DELETE FROM tasks WHERE id = ?`, taskId);
    await app.close();
  });

  it("POST /api/tasks/:id/comments is registered and workspace scoped", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: `/api/tasks/${randomUUID()}/comments`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty("error");
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

    const response = await app.inject({ method: "DELETE", url: `/api/cases/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toHaveProperty("error");
    await app.close();
  });

  it("a full success flow correlates access log + business event log under the same requestId (Requirements 10.1, 10.2, 10.5)", async () => {
    const { app, lines } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: { name: `route-check-${randomUUID()}`, endDate: "2038-01-01T00:00:00.000Z" },
    });

    expect(response.statusCode).toBe(201);
    createdCaseIds.push(response.json().id);

    const accessLine = lines.find((l) => l.path === "/api/cases" && l.statusCode === 201);
    const businessLine = lines.find((l) => l.event === "case.created");
    expect(accessLine).toBeTruthy();
    expect(businessLine).toBeTruthy();
    expect(businessLine?.requestId).toBe(accessLine?.requestId);
    expect(businessLine?.entityId).toBe(response.json().id);

    await app.close();
  });

  it("a full failure flow (thrown HttpError -> global error handler) correlates access log + error log under the same requestId (Requirements 10.1, 10.3, 10.5)", async () => {
    const { app, lines } = buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/cases/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    const accessLine = lines.find((l) => l.path?.toString().startsWith("/api/cases/") && l.statusCode === 404);
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
      headers: { origin: "http://localhost:3001" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3001");

    await app.close();
  });

  it("responds to a CORS preflight OPTIONS request for a state-changing route", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/users",
      headers: {
        origin: "http://localhost:3001",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.statusCode).toBeLessThan(300);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3001");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");

    await app.close();
  });
});

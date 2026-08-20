import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { InjectOptions } from "light-my-request";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createLogger } from "./shared/logger.js";
import { setBusinessEventLoggerForTests } from "./shared/business-event-logger.js";
import { db } from "./shared/db.js";
import { WORKSPACE_HEADER_NAME } from "./shared/workspace-scope.js";
import { withCsrfToken, withSessionCookie } from "./test/auth.fixture.js";

const WORKSPACE_SCOPED_PREFIXES = [
  "/api/cases",
  "/api/tasks",
  "/api/recurring-templates",
  "/api/holidays",
  "/api/development-stages",
  "/api/throughput",
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
    await db.$executeRawUnsafe(
      `DELETE FROM activity_logs WHERE task_id IN (SELECT id FROM tasks WHERE workspace_id = ?)`,
      authenticated.workspaceId,
    );
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

describe("app.ts のルート登録 (task 10.3)", () => {
  it.each([
    ["/api/users", "GET"],
    ["/api/tasks", "GET"],
    ["/api/cases", "GET"],
    ["/api/holidays", "GET"],
    ["/api/throughput?periodType=week&rangeCount=1", "GET"],
    ["/api/recurring-templates", "GET"],
    ["/api/development-stages", "GET"],
    ["/api/workspaces", "GET"],
  ] as const)("%s が登録されていて、404 ではないことを確認する", async (url, method) => {
    const { app } = buildTestApp();

    const response = await app.inject({ method, url });

    expect(response.statusCode).not.toBe(404);
    await app.close();
  });

  it("PATCH /api/tasks/:id/development-stage が登録されていて、404 ではないことを確認する (task 16.1)", async () => {
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

    await db.$executeRawUnsafe(`DELETE FROM activity_logs WHERE task_id = ?`, taskId);
    await db.$executeRawUnsafe(`DELETE FROM tasks WHERE id = ?`, taskId);
    await app.close();
  });

  it("POST /api/tasks/:id/comments が登録されていて、ワークスペーススコープであることを確認する", async () => {
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

  describe("GET /api/throughput のワークスペーススコープ (task 3.5)", () => {
    const env = {
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      CORS_ORIGIN: "http://localhost:3001",
      COOKIE_SECURE: false,
      LOG_LEVEL: "error" as const,
      PORT: 3000,
    };

    function sessionCookie(response: { headers: Record<string, string | string[] | undefined> }): string {
      const setCookie = response.headers["set-cookie"];
      const session = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((cookie) =>
        cookie?.startsWith("session="),
      );
      if (!session) throw new Error("session cookie was not set");
      return session.split(";")[0];
    }

    it("認証済みの GET が X-Workspace-Id を省略している場合、400 を返す", async () => {
      const app = buildApp(env);
      const register = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: `throughput-scope-400-${randomUUID()}@example.test`,
          name: "消化数スコープ400",
          password: "password-123",
        },
      });
      expect(register.statusCode).toBe(201);
      const cookie = sessionCookie(register);
      const userId = register.json().id as string;

      const response = await app.inject(
        withSessionCookie(
          { method: "GET", url: "/api/throughput?periodType=week&rangeCount=1" },
          cookie,
        ),
      );
      expect(response.statusCode).toBe(400);

      await db.$executeRawUnsafe(`DELETE FROM users WHERE id = ?`, userId);
      await app.close();
    });

    it("認証済みの GET が非メンバーのワークスペースを使用している場合、403 を返す", async () => {
      const app = buildApp(env);
      const memberReg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: `throughput-scope-member-${randomUUID()}@example.test`,
          name: "消化数スコープメンバー",
          password: "password-123",
        },
      });
      const outsiderReg = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: `throughput-scope-outsider-${randomUUID()}@example.test`,
          name: "消化数スコープ部外者",
          password: "password-123",
        },
      });
      expect(memberReg.statusCode).toBe(201);
      expect(outsiderReg.statusCode).toBe(201);
      const memberCookie = sessionCookie(memberReg);
      const outsiderCookie = sessionCookie(outsiderReg);
      const memberId = memberReg.json().id as string;
      const outsiderId = outsiderReg.json().id as string;

      const csrf = await app.inject({
        method: "GET",
        url: "/api/auth/csrf",
        headers: { cookie: memberCookie },
      });
      const memberSession = sessionCookie(csrf);
      const created = await app.inject(
        withCsrfToken(
          withSessionCookie(
            {
              method: "POST",
              url: "/api/workspaces",
              payload: { name: `throughput-scope-${randomUUID()}` },
            },
            memberSession,
          ),
          csrf.json().token as string,
        ),
      );
      expect(created.statusCode).toBe(201);
      const workspaceId = created.json().id as string;

      const response = await app.inject(
        withSessionCookie(
          {
            method: "GET",
            url: "/api/throughput?periodType=week&rangeCount=1",
            headers: { [WORKSPACE_HEADER_NAME]: workspaceId },
          },
          outsiderCookie,
        ),
      );
      expect(response.statusCode).toBe(403);

      await db.$executeRawUnsafe(`DELETE FROM development_stages WHERE workspace_id = ?`, workspaceId);
      await db.$executeRawUnsafe(`DELETE FROM workspace_members WHERE workspace_id = ?`, workspaceId);
      await db.$executeRawUnsafe(`DELETE FROM workspaces WHERE id = ?`, workspaceId);
      await db.$executeRawUnsafe(`DELETE FROM users WHERE id IN (?, ?)`, memberId, outsiderId);
      await app.close();
    });
  });

  it("POST /api/client-errors が登録されていて、404 ではないことを確認する", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/client-errors",
      payload: { message: "boom", pageUrl: "https://app.example.com/", occurredAt: new Date().toISOString() },
    });

    expect(response.statusCode).not.toBe(404);
    await app.close();
  });

  it("グローバルエラーハンドラー: 任意のモジュールのルートからの HttpError は、JSON ではなく生の 500 の statusCode を返す", async () => {
    const { app } = buildTestApp();

    const response = await app.inject({ method: "DELETE", url: `/api/cases/${randomUUID()}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toHaveProperty("error");
    await app.close();
  });

  it("成功フローは、アクセスログ + ビジネスイベントログが同じ requestId (Requirements 10.1, 10.2, 10.5)", async () => {
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

  it("失敗フロー (HttpError がスローされる -> グローバルエラーハンドラー) は、アクセスログ + エラーログが同じ requestId (Requirements 10.1, 10.3, 10.5)", async () => {
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

describe("app.ts の CORS", () => {
  it("クロスオリジンの GET に対して、リクエストの Origin を反映した Access-Control-Allow-Origin ヘッダーを返す", async () => {
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

  it("CORS プレフライト OPTIONS リクエストに対して、状態変更ルートに対する応答を返す", async () => {
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

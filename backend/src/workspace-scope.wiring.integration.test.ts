// App-level wiring of requireWorkspaceMember (task 1.4;
// Requirements 2.2, 3.1, 3.2). Confirms the guard runs after requireUser
// only on the workspace-scoped path prefixes, and leaves excluded
// paths unaffected.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { db } from "./shared/db.js";
import { WORKSPACE_HEADER_NAME } from "./shared/workspace-scope.js";
import { withCsrfToken, withSessionCookie } from "./test/auth.fixture.js";

const env = {
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CORS_ORIGIN: "http://localhost:3001",
  COOKIE_SECURE: false,
  LOG_LEVEL: "error" as const,
  PORT: 3000,
};

type App = ReturnType<typeof buildApp>;

const SCOPED_PATHS = [
  "/api/cases",
  "/api/tasks",
  "/api/recurring-templates",
  "/api/holidays",
  "/api/development-stages",
  "/api/throughput",
] as const;

function sessionCookie(response: { headers: Record<string, string | string[] | undefined> }): string {
  const setCookie = response.headers["set-cookie"];
  const session = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((cookie) =>
    cookie?.startsWith("session="),
  );
  if (!session) throw new Error("session cookie was not set");
  return session.split(";")[0];
}

async function registerUser(app: App, name: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `ws-scope-wiring-${randomUUID()}@example.test`,
      name,
      password: "password-123",
    },
  });
  expect(response.statusCode).toBe(201);
  return {
    user: response.json() as { id: string; email: string; name: string },
    cookie: sessionCookie(response),
  };
}

async function csrfToken(app: App, cookie: string): Promise<{ token: string; cookie: string }> {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/csrf",
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  return { token: response.json().token as string, cookie: sessionCookie(response) };
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // workspaceService.create provisions terminal development_stages (1.2/1.3);
  // clear them before removing the workspace row (FK).
  if (table === "workspaces") {
    await db.$executeRawUnsafe(
      `DELETE FROM development_stages WHERE workspace_id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
  }
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

describe("workspace scope guard wiring (task 1.4)", () => {
  const app = buildApp(env);

  let memberId: string;
  let outsiderId: string;
  let workspaceId: string;
  let memberCsrf: { token: string; cookie: string };
  let outsiderCsrf: { token: string; cookie: string };

  beforeAll(async () => {
    const member = await registerUser(app, "スコープ配線メンバー");
    const outsider = await registerUser(app, "スコープ配線部外者");
    memberId = member.user.id;
    outsiderId = outsider.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    outsiderCsrf = await csrfToken(app, outsider.cookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: "/api/workspaces",
            payload: { name: `scope-wiring-${randomUUID()}` },
          },
          memberCsrf.cookie,
        ),
        memberCsrf.token,
      ),
    );
    expect(created.statusCode).toBe(201);
    workspaceId = created.json().id as string;
  });

  afterAll(async () => {
    const members = await db.workspaceMember.findMany({ where: { workspaceId } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspaceId]);
    await hardDelete("users", [memberId, outsiderId]);
    await app.close();
    await db.$disconnect();
  });

  it.each(SCOPED_PATHS)("returns 401 for unauthenticated GET %s", async (path) => {
    const response = await app.inject({ method: "GET", url: path });
    expect(response.statusCode).toBe(401);
  });

  it.each(SCOPED_PATHS)(
    "returns 400 when authenticated GET %s omits X-Workspace-Id",
    async (path) => {
      const response = await app.inject(
        withSessionCookie({ method: "GET", url: path }, memberCsrf.cookie),
      );
      expect(response.statusCode).toBe(400);
    },
  );

  it.each(SCOPED_PATHS)(
    "returns 403 when authenticated GET %s uses a non-member workspace",
    async (path) => {
      const response = await app.inject(
        withSessionCookie(
          {
            method: "GET",
            url: path,
            headers: { [WORKSPACE_HEADER_NAME]: workspaceId },
          },
          outsiderCsrf.cookie,
        ),
      );
      expect(response.statusCode).toBe(403);
    },
  );

  it("does not apply the workspace guard to excluded paths", async () => {
    const workspaces = await app.inject(
      withSessionCookie({ method: "GET", url: "/api/workspaces" }, memberCsrf.cookie),
    );
    expect(workspaces.statusCode).toBe(200);

    const users = await app.inject(
      withSessionCookie({ method: "GET", url: "/api/users" }, memberCsrf.cookie),
    );
    expect(users.statusCode).toBe(200);

    const me = await app.inject(
      withSessionCookie({ method: "GET", url: "/api/auth/me" }, memberCsrf.cookie),
    );
    expect(me.statusCode).toBe(200);

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    // client-errors is requireUser-exempt and outside the scoped prefixes;
    // a CSRF-valid POST without X-Workspace-Id must succeed (204).
    const publicCsrf = await app.inject({ method: "GET", url: "/api/auth/csrf" });
    expect(publicCsrf.statusCode).toBe(200);
    const clientErrors = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: "/api/client-errors",
            payload: {
              message: "scope wiring excluded",
              pageUrl: "http://localhost:3001/",
              occurredAt: new Date().toISOString(),
            },
          },
          sessionCookie(publicCsrf),
        ),
        publicCsrf.json().token as string,
      ),
    );
    expect(clientErrors.statusCode).toBe(204);
  });
});

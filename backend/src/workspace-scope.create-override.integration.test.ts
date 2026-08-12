// Create-time workspace attribution ignores client body (workspace-resource-scope
// task 9.2; Requirements 1.1, 1.2; design.md Testing Strategy Integration Tests:
// body workspaceId must not override X-Workspace-Id / current workspace context).
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

/** Isolate case create from active templates (omit templateOperations = full apply). */
const noApply = { templateOperations: [] as const };

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
      email: `ws-create-override-${randomUUID()}@example.test`,
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

async function createWorkspace(app: App, csrf: { token: string; cookie: string }, name: string): Promise<string> {
  const response = await app.inject(
    withCsrfToken(
      withSessionCookie({ method: "POST", url: "/api/workspaces", payload: { name } }, csrf.cookie),
      csrf.token,
    ),
  );
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

function withWorkspace(
  options: Parameters<App["inject"]>[0],
  cookie: string,
  csrf: string | undefined,
  workspaceId: string,
) {
  const withSession = withSessionCookie(
    {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        [WORKSPACE_HEADER_NAME]: workspaceId,
      },
    },
    cookie,
  );
  return csrf ? withCsrfToken(withSession, csrf) : withSession;
}

describe("create ignores body workspaceId (task 9.2)", () => {
  const app = buildApp(env);

  let memberId: string;
  let memberCsrf: { token: string; cookie: string };
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    const member = await registerUser(app, "作成上書き検証メンバー");
    memberId = member.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    workspaceA = await createWorkspace(app, memberCsrf, `create-override-a-${randomUUID()}`);
    workspaceB = await createWorkspace(app, memberCsrf, `create-override-b-${randomUUID()}`);
  });

  afterAll(async () => {
    await db.$executeRawUnsafe(`DELETE FROM tasks WHERE workspace_id IN (?, ?)`, workspaceA, workspaceB);
    await db.$executeRawUnsafe(`DELETE FROM cases WHERE workspace_id IN (?, ?)`, workspaceA, workspaceB);
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: { in: [workspaceA, workspaceB] } },
    });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspaceA, workspaceB]);
    await hardDelete("users", [memberId]);
    await app.close();
    await db.$disconnect();
  });

  it("POST /api/cases ignores body workspaceId and attributes to X-Workspace-Id (Requirements 1.1, 1.2)", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: {
            name: "body-workspace-override-case",
            endDate: "2026-09-01T00:00:00.000Z",
            workspaceId: workspaceB,
            ...noApply,
          },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; workspaceId: string };
    expect(body.workspaceId).toBe(workspaceA);
    expect(body.workspaceId).not.toBe(workspaceB);

    const persisted = await db.case.findUnique({ where: { id: body.id } });
    expect(persisted?.workspaceId).toBe(workspaceA);

    await hardDelete("cases", [body.id]);
  });

  it("POST /api/tasks ignores body workspaceId and attributes to X-Workspace-Id (Requirements 1.1, 1.2)", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: {
            title: "body-workspace-override-task",
            priority: "low",
            workspaceId: workspaceB,
          },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; workspaceId: string };
    expect(body.workspaceId).toBe(workspaceA);
    expect(body.workspaceId).not.toBe(workspaceB);

    const persisted = await db.task.findUnique({ where: { id: body.id } });
    expect(persisted?.workspaceId).toBe(workspaceA);

    await hardDelete("tasks", [body.id]);
  });
});

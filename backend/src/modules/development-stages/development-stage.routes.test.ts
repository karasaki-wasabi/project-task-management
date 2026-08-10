// developmentStageRoutes workspace scope (workspace-resource-scope task 6.1;
// Requirements 1.1, 1.2, 3.1, 3.2, 3.3). Uses buildApp so requireUser /
// CSRF / requireWorkspaceMember apply; injects X-Workspace-Id.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { db } from "../../shared/db.js";
import { WORKSPACE_HEADER_NAME } from "../../shared/workspace-scope.js";
import { withCsrfToken, withSessionCookie } from "../../test/auth.fixture.js";

const env = {
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CORS_ORIGIN: "http://localhost:3001",
  COOKIE_SECURE: false,
  LOG_LEVEL: "error" as const,
  PORT: 3000,
};

type App = ReturnType<typeof buildApp>;

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
      email: `stage-route-${randomUUID()}@example.test`,
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

describe("developmentStageRoutes (task 14.1 + workspace-resource-scope 6.1)", () => {
  const app = buildApp(env);

  let memberId: string;
  let memberCsrf: { token: string; cookie: string };
  let workspaceA: string;
  let workspaceB: string;
  const stageIds: string[] = [];

  beforeAll(async () => {
    const member = await registerUser(app, "ステージルートメンバー");
    memberId = member.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    workspaceA = await createWorkspace(app, memberCsrf, `stage-route-a-${randomUUID()}`);
    workspaceB = await createWorkspace(app, memberCsrf, `stage-route-b-${randomUUID()}`);
  });

  afterEach(async () => {
    if (stageIds.length > 0) {
      await hardDelete("development_stages", stageIds.splice(0));
    }
  });

  afterAll(async () => {
    await db.$executeRawUnsafe(
      `DELETE FROM development_stages WHERE workspace_id IN (?, ?)`,
      workspaceA,
      workspaceB,
    );
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

  it("POST /api/development-stages registers a stage in the current workspace and returns 201", async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/development-stages", payload: { name: "spec-tbd" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().name).toBe("spec-tbd");
    expect(response.json().workspaceId).toBe(workspaceA);
    stageIds.push(response.json().id);
  });

  it("POST /api/development-stages returns 400 for an empty name", async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/development-stages", payload: { name: "" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(400);
  });

  it("PATCH /api/development-stages/:id renames a stage in the current workspace", async () => {
    const created = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/development-stages", payload: { name: "before" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    stageIds.push(id);

    const response = await app.inject(
      withWorkspace(
        { method: "PATCH", url: `/api/development-stages/${id}`, payload: { name: "after" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("after");
  });

  it("PATCH /api/development-stages/:id returns 404 for a stage in another workspace (Requirement 3.3)", async () => {
    const foreign = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/development-stages", payload: { name: "foreign-rename" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(foreign.statusCode).toBe(201);
    const foreignId = foreign.json().id as string;
    stageIds.push(foreignId);

    const response = await app.inject(
      withWorkspace(
        { method: "PATCH", url: `/api/development-stages/${foreignId}`, payload: { name: "hijacked" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(404);
  });

  it("POST /api/development-stages/reorder updates the order within the current workspace", async () => {
    const a = (
      await app.inject(
        withWorkspace(
          { method: "POST", url: "/api/development-stages", payload: { name: "a" } },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      )
    ).json();
    const b = (
      await app.inject(
        withWorkspace(
          { method: "POST", url: "/api/development-stages", payload: { name: "b" } },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      )
    ).json();
    stageIds.push(a.id, b.id);

    await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/development-stages", payload: { name: "foreign" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    ).then((res) => {
      expect(res.statusCode).toBe(201);
      stageIds.push(res.json().id);
    });

    const existing = (
      await app.inject(
        withWorkspace({ method: "GET", url: "/api/development-stages" }, memberCsrf.cookie, undefined, workspaceA),
      )
    ).json();
    const others = existing.map((s: { id: string }) => s.id).filter((id: string) => id !== a.id && id !== b.id);

    const response = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/development-stages/reorder", payload: { orderedIds: [b.id, a.id, ...others] } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().slice(0, 2).map((s: { id: string }) => s.id)).toEqual([b.id, a.id]);
  });

  it("GET /api/development-stages lists only current-workspace stages and excludes removed ones", async () => {
    const created = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/development-stages", payload: { name: "removable" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    stageIds.push(id);

    const foreign = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/development-stages", payload: { name: "other-ws" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(foreign.statusCode).toBe(201);
    stageIds.push(foreign.json().id);

    const deleteResponse = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/development-stages/${id}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(deleteResponse.statusCode).toBe(204);
    stageIds.splice(stageIds.indexOf(id), 1);

    const listResponse = await app.inject(
      withWorkspace({ method: "GET", url: "/api/development-stages" }, memberCsrf.cookie, undefined, workspaceA),
    );
    const list = listResponse.json() as { id: string }[];
    expect(list.some((s) => s.id === id)).toBe(false);
    expect(list.some((s) => s.id === foreign.json().id)).toBe(false);
  });

  it("DELETE /api/development-stages/:id returns 404 for a non-existent stage", async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/development-stages/${randomUUID()}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(404);
  });

  it("DELETE /api/development-stages/:id returns 404 for a stage in another workspace (Requirement 3.3)", async () => {
    const foreign = await app.inject(
      withWorkspace(
        { method: "POST", url: "/api/development-stages", payload: { name: "foreign-delete" } },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    expect(foreign.statusCode).toBe(201);
    const foreignId = foreign.json().id as string;
    stageIds.push(foreignId);

    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/development-stages/${foreignId}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(404);

    const stillThere = await app.inject(
      withWorkspace({ method: "GET", url: "/api/development-stages" }, memberCsrf.cookie, undefined, workspaceB),
    );
    expect(stillThere.json().some((s: { id: string }) => s.id === foreignId)).toBe(true);
  });
});

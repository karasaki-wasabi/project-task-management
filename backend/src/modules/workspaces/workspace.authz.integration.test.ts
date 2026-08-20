import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { db } from "../../shared/db.js";
import { withCsrfToken, withSessionCookie } from "../../test/auth.fixture.js";
import { createUserData } from "../../test/user.fixture.js";
import { workspaceRepository } from "./workspace.repository.js";

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
      email: `ws-authz-${randomUUID()}@example.test`,
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
  if (table === "workspaces") {
    await db.$executeRawUnsafe(
      `DELETE FROM development_stages WHERE workspace_id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
  }
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

describe("workspace-scoped API authorization (task 7.1)", () => {
  const app = buildApp(env);

  let creatorId: string;
  let memberId: string;
  let outsiderId: string;
  let targetUserId: string;
  let workspaceId: string;
  let creatorCsrf: { token: string; cookie: string };
  let memberCsrf: { token: string; cookie: string };
  let outsiderCsrf: { token: string; cookie: string };

  beforeAll(async () => {
    const creator = await registerUser(app, "権限横断作成者");
    const member = await registerUser(app, "権限横断メンバー");
    const outsider = await registerUser(app, "権限横断部外者");
    const target = await db.user.create({
      data: createUserData(`ws-authz-target-${randomUUID()}`),
    });

    creatorId = creator.user.id;
    memberId = member.user.id;
    outsiderId = outsider.user.id;
    targetUserId = target.id;

    creatorCsrf = await csrfToken(app, creator.cookie);
    memberCsrf = await csrfToken(app, member.cookie);
    outsiderCsrf = await csrfToken(app, outsider.cookie);

    const created = await app.inject(
      withCsrfToken(
        withSessionCookie(
          {
            method: "POST",
            url: "/api/workspaces",
            payload: { name: `authz-${randomUUID()}` },
          },
          creatorCsrf.cookie,
        ),
        creatorCsrf.token,
      ),
    );
    expect(created.statusCode).toBe(201);
    workspaceId = created.json().id as string;
    await workspaceRepository.createMember({ workspaceId, userId: memberId });
  });

  afterAll(async () => {
    const members = await db.workspaceMember.findMany({ where: { workspaceId } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspaceId]);
    await hardDelete("users", [creatorId, memberId, outsiderId, targetUserId]);
    await app.close();
    await db.$disconnect();
  });

  it.each([
    {
      name: "workspaceRoutes.listMembers",
      requirement: "3.2",
      request: () =>
        withSessionCookie(
          { method: "GET", url: `/api/workspaces/${workspaceId}/members` },
          outsiderCsrf.cookie,
        ),
      expected: 403,
    },
    {
      name: "workspaceRoutes.searchAddableUsers",
      requirement: "4.5",
      request: () =>
        withSessionCookie(
          {
            method: "GET",
            url: `/api/workspaces/${workspaceId}/searchable-users?q=x`,
          },
          outsiderCsrf.cookie,
        ),
      expected: 403,
    },
    {
      name: "workspaceRoutes.addMember",
      requirement: "4.5",
      request: () =>
        withCsrfToken(
          withSessionCookie(
            {
              method: "POST",
              url: `/api/workspaces/${workspaceId}/members`,
              payload: { userId: targetUserId },
            },
            outsiderCsrf.cookie,
          ),
          outsiderCsrf.token,
        ),
      expected: 403,
    },
    {
      name: "workspaceRoutes.update",
      requirement: "6.5",
      request: () =>
        withCsrfToken(
          withSessionCookie(
            {
              method: "PATCH",
              url: `/api/workspaces/${workspaceId}`,
              payload: { name: "hijack" },
            },
            outsiderCsrf.cookie,
          ),
          outsiderCsrf.token,
        ),
      expected: 403,
    },
  ])("workspaceRoutes.$name で non-member を拒斥し、403 エラーを返す (Requirement $requirement)", async ({ request, expected }) => {
    const response = await app.inject(request());
    expect(response.statusCode).toBe(expected);
  });

  it("workspaceRoutes.delete で non-creator member を拒斥し、403 エラーを返す (Requirement 7.2)", async () => {
    const response = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "DELETE", url: `/api/workspaces/${workspaceId}` },
          memberCsrf.cookie,
        ),
        memberCsrf.token,
      ),
    );
    expect(response.statusCode).toBe(403);
    expect(await workspaceRepository.findById(workspaceId)).not.toBeNull();
  });

  it("workspaceRoutes.delete で non-member を拒斥し、404 エラーを返す (Requirement 7.3)", async () => {
    const response = await app.inject(
      withCsrfToken(
        withSessionCookie(
          { method: "DELETE", url: `/api/workspaces/${workspaceId}` },
          outsiderCsrf.cookie,
        ),
        outsiderCsrf.token,
      ),
    );
    expect(response.statusCode).toBe(404);
  });

  it.each([
    {
      name: "GET /api/workspaces/:id/members",
      build: (id: string) =>
        withSessionCookie({ method: "GET", url: `/api/workspaces/${id}/members` }, creatorCsrf.cookie),
    },
    {
      name: "GET /api/workspaces/:id/searchable-users",
      build: (id: string) =>
        withSessionCookie(
          { method: "GET", url: `/api/workspaces/${id}/searchable-users?q=x` },
          creatorCsrf.cookie,
        ),
    },
    {
      name: "POST /api/workspaces/:id/members",
      build: (id: string) =>
        withCsrfToken(
          withSessionCookie(
            {
              method: "POST",
              url: `/api/workspaces/${id}/members`,
              payload: { userId: targetUserId },
            },
            creatorCsrf.cookie,
          ),
          creatorCsrf.token,
        ),
    },
    {
      name: "PATCH /api/workspaces/:id",
      build: (id: string) =>
        withCsrfToken(
          withSessionCookie(
            {
              method: "PATCH",
              url: `/api/workspaces/${id}`,
              payload: { name: "ghost" },
            },
            creatorCsrf.cookie,
          ),
          creatorCsrf.token,
        ),
    },
    {
      name: "DELETE /api/workspaces/:id",
      build: (id: string) =>
        withCsrfToken(
          withSessionCookie({ method: "DELETE", url: `/api/workspaces/${id}` }, creatorCsrf.cookie),
          creatorCsrf.token,
        ),
    },
  ])("workspaceRoutes.$name で unknown workspace を拒斥し、404 エラーを返す", async ({ build }) => {
    const response = await app.inject(build(randomUUID()));
    expect(response.statusCode).toBe(404);
  });

  it("workspaceRoutes.list で user が所属しない workspace をリストしない (Requirement 2.4)", async () => {
    const listed = await app.inject(
      withSessionCookie({ method: "GET", url: "/api/workspaces" }, outsiderCsrf.cookie),
    );
    expect(listed.statusCode).toBe(200);
    const body = listed.json() as Array<{ id: string }>;
    expect(body.map((w) => w.id)).not.toContain(workspaceId);
  });
});

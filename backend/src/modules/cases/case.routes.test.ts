// caseRoutes workspace scope (workspace-resource-scope task 2.1;
// Requirements 1.1, 1.2, 3.1, 3.2, 3.3). Uses buildApp so requireUser /
// CSRF / requireWorkspaceMember apply; injects X-Workspace-Id.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

/** Isolate route tests from active templates (omit templateOperations = full apply). */
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
      email: `case-route-${randomUUID()}@example.test`,
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
      withSessionCookie(
        { method: "POST", url: "/api/workspaces", payload: { name } },
        csrf.cookie,
      ),
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

describe("caseRoutes (task 3.3 + workspace-resource-scope 2.1)", () => {
  const app = buildApp(env);

  let memberId: string;
  let memberCsrf: { token: string; cookie: string };
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    const member = await registerUser(app, "案件ルートメンバー");
    memberId = member.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    workspaceA = await createWorkspace(app, memberCsrf, `case-route-a-${randomUUID()}`);
    workspaceB = await createWorkspace(app, memberCsrf, `case-route-b-${randomUUID()}`);
  });

  afterAll(async () => {
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

  it("POST /api/cases creates a case in the current workspace and returns 201 (Requirement 1.1)", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "route case", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe("route case");
    expect(body.isCompleted).toBe(false);
    expect(body.workspaceId).toBe(workspaceA);

    await hardDelete("cases", [body.id]);
  });

  it("POST /api/cases returns 400 when startDate is later than endDate", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: {
            name: "invalid range",
            startDate: "2026-09-10T00:00:00.000Z",
            endDate: "2026-09-01T00:00:00.000Z",
            ...noApply,
          },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(400);
  });

  it("PATCH /api/cases/:id updates isCompleted independently, and returns 404 for unknown id", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "patchable", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const { id } = created.json();

    const okResponse = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/cases/${id}`,
          payload: { isCompleted: true, ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(okResponse.statusCode).toBe(200);
    const body = okResponse.json();
    expect(body.isCompleted).toBe(true);
    expect(body.name).toBe("patchable");

    const missingResponse = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/cases/${randomUUID()}`,
          payload: { isCompleted: true, ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete("cases", [id]);
  });

  it("PATCH /api/cases/:id returns 404 for a case in another workspace (Requirement 3.3)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "other-ws-patch", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    const { id } = created.json();

    const response = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/cases/${id}`,
          payload: { name: "hijack", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(response.statusCode).toBe(404);

    await hardDelete("cases", [id]);
  });

  it("PATCH /api/cases/:id updates name, startDate, and endDate each independently (Requirement 2.5)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: {
            name: "original name",
            startDate: "2026-08-01T00:00:00.000Z",
            endDate: "2026-09-01T00:00:00.000Z",
            ...noApply,
          },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const { id } = created.json();

    const nameOnly = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/cases/${id}`,
          payload: { name: "renamed", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(nameOnly.statusCode).toBe(200);
    expect(nameOnly.json()).toMatchObject({
      name: "renamed",
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-09-01T00:00:00.000Z",
    });

    const startDateOnly = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/cases/${id}`,
          payload: { startDate: "2026-08-05T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(startDateOnly.statusCode).toBe(200);
    expect(startDateOnly.json()).toMatchObject({
      name: "renamed",
      startDate: "2026-08-05T00:00:00.000Z",
      endDate: "2026-09-01T00:00:00.000Z",
    });

    const endDateOnly = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/cases/${id}`,
          payload: { endDate: "2026-09-10T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(endDateOnly.statusCode).toBe(200);
    expect(endDateOnly.json()).toMatchObject({
      name: "renamed",
      startDate: "2026-08-05T00:00:00.000Z",
      endDate: "2026-09-10T00:00:00.000Z",
    });

    await hardDelete("cases", [id]);
  });

  it("DELETE /api/cases/:id detaches linked Task caseId to null (Requirements 8.1, 8.2)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "detach case", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const { id } = created.json();
    const linkedTask = await db.task.create({
      data: { title: "linked task", priority: "low", caseId: id, workspaceId: workspaceA },
    });

    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/cases/${id}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(response.statusCode).toBe(204);

    const survivingTask = await db.task.findUnique({ where: { id: linkedTask.id } });
    expect(survivingTask?.caseId).toBeNull();

    await hardDelete("tasks", [linkedTask.id]);
    await hardDelete("cases", [id]);
  });

  it("DELETE /api/cases/:id returns 404 for a case in another workspace (Requirement 3.3)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "other-ws-delete", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    const { id } = created.json();

    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/cases/${id}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(response.statusCode).toBe(404);

    await hardDelete("cases", [id]);
  });

  it("GET /api/cases/:id/progress returns progress, and 404 for unknown id", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "progress route", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const { id } = created.json();

    const response = await app.inject(
      withWorkspace(
        { method: "GET", url: `/api/cases/${id}/progress` },
        memberCsrf.cookie,
        undefined,
        workspaceA,
      ),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      requiredTotal: 0,
      requiredCompleted: 0,
      requiredIncomplete: 0,
      isOverdueWithIncomplete: false,
    });

    const missingResponse = await app.inject(
      withWorkspace(
        { method: "GET", url: `/api/cases/${randomUUID()}/progress` },
        memberCsrf.cookie,
        undefined,
        workspaceA,
      ),
    );
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete("cases", [id]);
  });

  it("GET /api/cases/:id/progress returns 404 for a case in another workspace (Requirement 3.3)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "progress other", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    const { id } = created.json();

    const response = await app.inject(
      withWorkspace(
        { method: "GET", url: `/api/cases/${id}/progress` },
        memberCsrf.cookie,
        undefined,
        workspaceA,
      ),
    );
    expect(response.statusCode).toBe(404);

    await hardDelete("cases", [id]);
  });

  it("GET /api/cases lists only current-workspace cases and excludes deleted ones (Requirement 3.1)", async () => {
    const createdA = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "listable-a", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const createdB = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "listable-b", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    const idA = createdA.json().id as string;
    const idB = createdB.json().id as string;

    const listBeforeDelete = await app.inject(
      withWorkspace({ method: "GET", url: "/api/cases" }, memberCsrf.cookie, undefined, workspaceA),
    );
    expect(listBeforeDelete.statusCode).toBe(200);
    expect(listBeforeDelete.json().some((c: { id: string }) => c.id === idA)).toBe(true);
    expect(listBeforeDelete.json().some((c: { id: string }) => c.id === idB)).toBe(false);

    const deleteResponse = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/cases/${idA}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject(
      withWorkspace({ method: "GET", url: "/api/cases" }, memberCsrf.cookie, undefined, workspaceA),
    );
    expect(listResponse.statusCode).toBe(200);
    expect(Array.isArray(listResponse.json())).toBe(true);
    expect(listResponse.json().some((c: { id: string }) => c.id === idA)).toBe(false);

    await hardDelete("cases", [idA, idB]);
  });

  it("DELETE /api/cases/:id returns 404 for a non-existent case", async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/cases/${randomUUID()}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(404);
  });

  it("POST /api/cases with startDate and endDate both omitted returns 201 with endDate null (task 15.1)", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "no dates case", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe("no dates case");
    expect(body.startDate).toBeNull();
    expect(body.endDate).toBeNull();

    await hardDelete("cases", [body.id]);
  });

  it("PATCH /api/cases/:id with endDate null unsets a previously set endDate (task 15.1)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "unset endDate case", endDate: "2026-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const { id, endDate } = created.json();
    expect(endDate).toBe("2026-09-01T00:00:00.000Z");

    const response = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/cases/${id}`,
          payload: { endDate: null, ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.endDate).toBeNull();

    await hardDelete("cases", [id]);
  });

  it("PATCH /api/cases/:id with startDate null unsets a previously set startDate (task 15.1)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/cases",
          payload: { name: "unset startDate case", startDate: "2041-09-01T00:00:00.000Z", ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const { id, startDate } = created.json();
    expect(startDate).toBe("2041-09-01T00:00:00.000Z");

    const response = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/cases/${id}`,
          payload: { startDate: null, ...noApply },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.startDate).toBeNull();

    await hardDelete("cases", [id]);
  });
});

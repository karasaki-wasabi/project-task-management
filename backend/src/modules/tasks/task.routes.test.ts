// taskRoutes workspace scope (workspace-resource-scope task 3.1;
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
      email: `task-route-${randomUUID()}@example.test`,
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

describe("taskRoutes (task 3.1 + workspace-resource-scope 3.1)", () => {
  const app = buildApp(env);

  let memberId: string;
  let memberCsrf: { token: string; cookie: string };
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    const member = await registerUser(app, "タスクトルートメンバー");
    memberId = member.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    workspaceA = await createWorkspace(app, memberCsrf, `task-route-a-${randomUUID()}`);
    workspaceB = await createWorkspace(app, memberCsrf, `task-route-b-${randomUUID()}`);
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

  it("POST /api/tasks creates a task in the current workspace and returns 201 (Requirement 1.1)", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "route task", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe("route task");
    expect(body.status).toBe("not_started");
    expect(body.workspaceId).toBe(workspaceA);

    await hardDelete("tasks", [body.id]);
  });

  it("POST /api/tasks returns 400 for an empty title", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(400);
  });

  it("PATCH /api/tasks/:id/status updates status, returns 404 for unknown id", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "patchable", priority: "high" },
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
          url: `/api/tasks/${id}/status`,
          payload: { status: "on_hold" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json().status).toBe("on_hold");

    const missingResponse = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${randomUUID()}/status`,
          payload: { status: "ready_for_handoff" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete("tasks", [id]);
  });

  it("GET /api/tasks/:id returns a task, 404 for unknown id", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "detail route", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const { id } = created.json();

    const okResponse = await app.inject(
      withWorkspace({ method: "GET", url: `/api/tasks/${id}` }, memberCsrf.cookie, undefined, workspaceA),
    );
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json().id).toBe(id);

    const missingResponse = await app.inject(
      withWorkspace(
        { method: "GET", url: `/api/tasks/${randomUUID()}` },
        memberCsrf.cookie,
        undefined,
        workspaceA,
      ),
    );
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete("tasks", [id]);
  });

  it("GET /api/tasks/:id returns 404 for a task in another workspace (Requirement 3.3)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "other-ws-get", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    const { id } = created.json();

    const response = await app.inject(
      withWorkspace({ method: "GET", url: `/api/tasks/${id}` }, memberCsrf.cookie, undefined, workspaceA),
    );
    expect(response.statusCode).toBe(404);

    await hardDelete("tasks", [id]);
  });

  it("PATCH /api/tasks/:id updates task fields, 404 for unknown id, 400 for empty title", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "editable", priority: "low", memo: "old" },
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
          url: `/api/tasks/${id}`,
          payload: { title: "edited", priority: "high", memo: "new" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json()).toMatchObject({ title: "edited", priority: "high", memo: "new" });

    const badResponse = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${id}`,
          payload: { title: "" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(badResponse.statusCode).toBe(400);

    const missingResponse = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${randomUUID()}`,
          payload: { title: "ghost" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(missingResponse.statusCode).toBe(404);

    await hardDelete("tasks", [id]);
  });

  it("PATCH /api/tasks/:id returns 404 for a task in another workspace (Requirement 3.3)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "other-ws-patch", priority: "low" },
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
          url: `/api/tasks/${id}`,
          payload: { title: "hijack" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(response.statusCode).toBe(404);

    await hardDelete("tasks", [id]);
  });

  it("GET /api/tasks lists only current-workspace tasks and excludes deleted ones (Requirement 3.1)", async () => {
    const createdA = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "listable-a", priority: "low" },
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
          url: "/api/tasks",
          payload: { title: "listable-b", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    const idA = createdA.json().id as string;
    const idB = createdB.json().id as string;

    const deleteResponse = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/tasks/${idA}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject(
      withWorkspace({ method: "GET", url: "/api/tasks" }, memberCsrf.cookie, undefined, workspaceA),
    );
    expect(listResponse.statusCode).toBe(200);
    const ids = listResponse.json().map((t: { id: string }) => t.id);
    expect(ids).not.toContain(idA);
    expect(ids).not.toContain(idB);

    await hardDelete("tasks", [idA, idB]);
  });

  it("GET /api/tasks?unassignedCase=true returns only tasks with no case assigned", async () => {
    const caseRecord = await db.case.create({
      data: { name: `route-case-${randomUUID()}`, endDate: new Date(), workspaceId: workspaceA },
    });

    const unassigned = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "route unassigned", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const assigned = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "route assigned", priority: "low", caseId: caseRecord.id },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const unassignedId = unassigned.json().id;
    const assignedId = assigned.json().id;

    const response = await app.inject(
      withWorkspace(
        { method: "GET", url: "/api/tasks?unassignedCase=true" },
        memberCsrf.cookie,
        undefined,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(200);
    const ids = response.json().map((t: { id: string }) => t.id);
    expect(ids).toContain(unassignedId);
    expect(ids).not.toContain(assignedId);

    await hardDelete("tasks", [unassignedId, assignedId]);
    await hardDelete("cases", [caseRecord.id]);
  });

  it('GET /api/tasks?unassignedCase=false is rejected (only the literal "true" is accepted)', async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "GET", url: "/api/tasks?unassignedCase=false" },
        memberCsrf.cookie,
        undefined,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(400);
  });

  it("DELETE /api/tasks/:id returns 404 for a non-existent task", async () => {
    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/tasks/${randomUUID()}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(404);
  });

  it("DELETE /api/tasks/:id returns 404 for a task in another workspace (Requirement 3.3)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "other-ws-delete", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceB,
      ),
    );
    const { id } = created.json();

    const response = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/tasks/${id}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(response.statusCode).toBe(404);

    await hardDelete("tasks", [id]);
  });
});

describe("taskRoutes hierarchy (task 3.2)", () => {
  const app = buildApp(env);

  let memberId: string;
  let memberCsrf: { token: string; cookie: string };
  let workspaceA: string;

  beforeAll(async () => {
    const member = await registerUser(app, "タスク階層ルート");
    memberId = member.user.id;
    memberCsrf = await csrfToken(app, member.cookie);
    workspaceA = await createWorkspace(app, memberCsrf, `task-hier-a-${randomUUID()}`);
  });

  afterAll(async () => {
    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspaceA } });
    await hardDelete(
      "workspace_members",
      members.map((m) => m.id),
    );
    await hardDelete("workspaces", [workspaceA]);
    await hardDelete("users", [memberId]);
    await app.close();
    await db.$disconnect();
  });

  it("POST /api/tasks/:id/children creates a child task and returns 201", async () => {
    const parent = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "parent", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const parentId = parent.json().id;

    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: `/api/tasks/${parentId}/children`,
          payload: { title: "child", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().parentTaskId).toBe(parentId);
    expect(response.json().workspaceId).toBe(workspaceA);

    await hardDelete("tasks", [response.json().id, parentId]);
  });

  it("POST /api/tasks/:id/children returns 404 for a non-existent parent", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: `/api/tasks/${randomUUID()}/children`,
          payload: { title: "orphan", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(404);
  });

  it("POST /api/tasks/:id/split splits a task into parts and returns 201", async () => {
    const original = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "big", priority: "high" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const originalId = original.json().id;

    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: `/api/tasks/${originalId}/split`,
          payload: {
            parts: [
              { title: "part 1", priority: "low" },
              { title: "part 2", priority: "low" },
            ],
          },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(201);
    const parts = response.json();
    expect(parts).toHaveLength(2);
    expect(parts[0].priority).toBe("high");
    expect(parts[0].workspaceId).toBe(workspaceA);

    await hardDelete("tasks", [...parts.map((p: { id: string }) => p.id), originalId]);
  });

  it("POST /api/tasks/:id/split returns 400 when given fewer than 2 parts", async () => {
    const original = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "small", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const originalId = original.json().id;

    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: `/api/tasks/${originalId}/split`,
          payload: { parts: [{ title: "only one", priority: "low" }] },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(400);

    await hardDelete("tasks", [originalId]);
  });

  // task-status-model 3.2: terminal-stage status edits → status_not_applicable (409).
  it("PATCH /api/tasks/:id/status returns 409 when the task is on a terminal stage (4.5)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "terminal status route", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const taskId = created.json().id as string;
    const completedStage = await db.developmentStage.create({
      data: {
        name: `completed-route-${randomUUID()}`,
        order: 950,
        kind: "completed",
        workspaceId: workspaceA,
      },
    });
    const moved = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${taskId}/development-stage`,
          payload: { developmentStageId: completedStage.id },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(moved.statusCode).toBe(200);

    const response = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${taskId}/status`,
          payload: { status: "in_progress" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/status not applicable/i);

    await hardDelete("tasks", [taskId]);
    await hardDelete("development_stages", [completedStage.id]);
  });

  it("PATCH /api/tasks/:id does not accept completedAt (2.6)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "no direct completedAt", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const taskId = created.json().id as string;

    const response = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${taskId}`,
          payload: { completedAt: new Date().toISOString() },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(400);

    await hardDelete("tasks", [taskId]);
  });

  it("PATCH /api/tasks/:id/development-stage updates developmentStageId and returns 200 (task 15.1)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "stage route task", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const taskId = created.json().id;
    const stage = await db.developmentStage.create({
      data: { name: `route-stage-${randomUUID()}`, order: 0, workspaceId: workspaceA },
    });

    const response = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${taskId}/development-stage`,
          payload: { developmentStageId: stage.id },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().developmentStageId).toBe(stage.id);

    await hardDelete("tasks", [taskId]);
    await hardDelete("development_stages", [stage.id]);
  });

  it("PATCH /api/tasks/:id/development-stage returns 404 for a non-existent task", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${randomUUID()}/development-stage`,
          payload: { developmentStageId: randomUUID() },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(404);
  });
});

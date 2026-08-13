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
  if (table === "tasks") {
    await db.$executeRawUnsafe(
      `DELETE FROM activity_logs WHERE task_id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
  }
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

  it("POST /api/tasks stores an optional scheduledEndDate (task-detail 2.9)", async () => {
    const response = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: {
            title: "duplicated task with end date",
            priority: "medium",
            scheduledEndDate: "2036-08-15",
          },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    const body = response.json();
    if (response.statusCode === 201) {
      await hardDelete("tasks", [body.id]);
    }
    expect(response.statusCode).toBe(201);
    expect(body.scheduledEndDate).toBe("2036-08-15T00:00:00.000Z");
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
    await expect(
      db.activityLog.findFirst({
        where: { taskId: id, operationType: "field_changed", fieldName: "status" },
      }),
    ).resolves.toMatchObject({
      actorUserId: memberId,
      beforeValue: "not_started",
      afterValue: "on_hold",
    });

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
          payload: { title: "editable", priority: "low", detail: "old" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const createdBody = created.json();
    expect(created.statusCode).toBe(201);
    expect(createdBody).toMatchObject({ detail: "old" });
    expect(createdBody).not.toHaveProperty("memo");
    expect(createdBody).not.toHaveProperty("scheduledDate");
    expect(Object.hasOwn(createdBody, "scheduledEndDate")).toBe(true);
    const { id } = createdBody;

    const okResponse = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${id}`,
          payload: { title: "edited", priority: "high", detail: "new" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json()).toMatchObject({ title: "edited", priority: "high", detail: "new" });
    expect(okResponse.json()).not.toHaveProperty("memo");
    expect(okResponse.json()).not.toHaveProperty("scheduledDate");
    const fieldLogs = await db.activityLog.findMany({
      where: { taskId: id, operationType: "field_changed" },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    expect(fieldLogs.map((log) => log.fieldName)).toEqual(["title", "priority", "detail"]);
    expect(fieldLogs.every((log) => log.actorUserId === memberId)).toBe(true);

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

  it("PATCH with only memo does not change detail (Requirement 1.4)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "keep-detail", priority: "low", detail: "original detail" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const memoOnly = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${id}`,
          payload: { memo: "should be ignored" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    // Zod strips unknown keys; empty body fails refine → 400, or succeeds without applying memo.
    if (memoOnly.statusCode === 200) {
      expect(memoOnly.json().detail).toBe("original detail");
      expect(memoOnly.json()).not.toHaveProperty("memo");
    }

    const got = await app.inject(
      withWorkspace({ method: "GET", url: `/api/tasks/${id}` }, memberCsrf.cookie, undefined, workspaceA),
    );
    expect(got.statusCode).toBe(200);
    expect(got.json().detail).toBe("original detail");
    expect(got.json()).not.toHaveProperty("memo");
    expect(got.json()).not.toHaveProperty("scheduledDate");

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

  it("returns a deleted task for detail reads and rejects every task write with 409 (task-detail 1.4)", async () => {
    const created = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "read-only deleted task", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(created.statusCode).toBe(201);
    const taskId = created.json().id as string;

    const deleted = await app.inject(
      withWorkspace(
        { method: "DELETE", url: `/api/tasks/${taskId}` },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    expect(deleted.statusCode).toBe(204);

    const detail = await app.inject(
      withWorkspace({ method: "GET", url: `/api/tasks/${taskId}` }, memberCsrf.cookie, undefined, workspaceA),
    );
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: taskId, title: "read-only deleted task" });
    expect(detail.json().deletedAt).toEqual(expect.any(String));

    const list = await app.inject(
      withWorkspace({ method: "GET", url: "/api/tasks" }, memberCsrf.cookie, undefined, workspaceA),
    );
    expect(list.statusCode).toBe(200);
    expect(list.json().map((task: { id: string }) => task.id)).not.toContain(taskId);

    const writes = await Promise.all([
      app.inject(
        withWorkspace(
          { method: "PATCH", url: `/api/tasks/${taskId}`, payload: { title: "must not change" } },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      ),
      app.inject(
        withWorkspace(
          { method: "PATCH", url: `/api/tasks/${taskId}/status`, payload: { status: "on_hold" } },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      ),
      app.inject(
        withWorkspace(
          {
            method: "PATCH",
            url: `/api/tasks/${taskId}/development-stage`,
            payload: { developmentStageId: null },
          },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      ),
      app.inject(
        withWorkspace(
          { method: "DELETE", url: `/api/tasks/${taskId}` },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      ),
      app.inject(
        withWorkspace(
          {
            method: "POST",
            url: `/api/tasks/${taskId}/children`,
            payload: { title: "must not create child", priority: "low" },
          },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      ),
      app.inject(
        withWorkspace(
          {
            method: "POST",
            url: `/api/tasks/${taskId}/split`,
            payload: {
              parts: [
                { title: "must not split 1", priority: "low" },
                { title: "must not split 2", priority: "low" },
              ],
            },
          },
          memberCsrf.cookie,
          memberCsrf.token,
          workspaceA,
        ),
      ),
    ]);

    expect(writes.map((response) => response.statusCode)).toEqual([409, 409, 409, 409, 409, 409]);
    for (const response of writes) {
      expect(response.json().error).toMatch(/task is deleted/i);
    }

    await hardDelete("tasks", [taskId]);
  });

  it("GET /api/tasks/:id/timeline filters, orders, pages, and reads deleted tasks", async () => {
    const task = await db.task.create({
      data: {
        title: `timeline-${randomUUID()}`,
        priority: "medium",
        workspaceId: workspaceA,
      },
    });
    const occurredAt = new Date("2037-04-05T06:07:08.000Z");
    const olderAt = new Date("2037-04-04T06:07:08.000Z");
    const commentIds = [`timeline-comment-a-${randomUUID()}`, `timeline-comment-z-${randomUUID()}`];
    const changeIds = [`timeline-change-a-${randomUUID()}`, `timeline-change-z-${randomUUID()}`];

    await db.comment.createMany({
      data: [
        {
          id: commentIds[0],
          taskId: task.id,
          authorUserId: memberId,
          body: "older comment",
          createdAt: olderAt,
          updatedAt: olderAt,
        },
        {
          id: commentIds[1],
          taskId: task.id,
          authorUserId: memberId,
          body: "newer comment",
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
      ],
    });
    await db.activityLog.createMany({
      data: [
        {
          id: changeIds[0],
          taskId: task.id,
          actorUserId: memberId,
          operationType: "field_changed",
          fieldName: "title",
          beforeValue: "before",
          afterValue: "after",
          occurredAt,
        },
        {
          id: changeIds[1],
          taskId: task.id,
          actorUserId: memberId,
          operationType: "field_changed",
          fieldName: "priority",
          beforeValue: "low",
          afterValue: "high",
          occurredAt,
        },
        {
          taskId: task.id,
          actorUserId: memberId,
          operationType: "task_created",
          occurredAt: new Date("2037-04-06T06:07:08.000Z"),
        },
        {
          taskId: task.id,
          actorUserId: memberId,
          operationType: "comment_edited",
          occurredAt: new Date("2037-04-07T06:07:08.000Z"),
        },
      ],
    });
    await db.task.delete({ where: { id: task.id } });

    try {
      const firstPage = await app.inject(
        withWorkspace(
          { method: "GET", url: `/api/tasks/${task.id}/timeline?filter=all&limit=2` },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      expect(firstPage.statusCode).toBe(200);
      const firstBody = firstPage.json() as {
        items: Array<{ id: string; type: string; occurredAt: string }>;
        nextCursor: string | null;
      };
      expect(firstBody.items).toHaveLength(2);
      expect(firstBody.items.map((item) => item.id)).toEqual(
        [commentIds[1], ...changeIds].sort((a, b) => b.localeCompare(a)).slice(0, 2),
      );
      expect(firstBody.items.every((item) => item.occurredAt === occurredAt.toISOString())).toBe(true);
      expect(firstBody.nextCursor).toEqual(expect.any(String));

      const secondPage = await app.inject(
        withWorkspace(
          {
            method: "GET",
            url:
              `/api/tasks/${task.id}/timeline?filter=all&limit=2&cursor=` +
              encodeURIComponent(firstBody.nextCursor!),
          },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      expect(secondPage.statusCode).toBe(200);
      expect(secondPage.json().items.map((item: { id: string }) => item.id)).toEqual([
        [commentIds[1], ...changeIds].sort((a, b) => b.localeCompare(a))[2],
        commentIds[0],
      ]);
      expect(secondPage.json().nextCursor).toBeNull();

      const comments = await app.inject(
        withWorkspace(
          { method: "GET", url: `/api/tasks/${task.id}/timeline?filter=comments&limit=1` },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      expect(comments.statusCode).toBe(200);
      expect(comments.json().items).toEqual([
        expect.objectContaining({ id: commentIds[1], type: "comment", body: "newer comment" }),
      ]);
      expect(comments.json().nextCursor).toEqual(expect.any(String));

      const commentsNextPage = await app.inject(
        withWorkspace(
          {
            method: "GET",
            url:
              `/api/tasks/${task.id}/timeline?filter=comments&limit=1&cursor=` +
              encodeURIComponent(comments.json().nextCursor as string),
          },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      expect(commentsNextPage.statusCode).toBe(200);
      expect(commentsNextPage.json()).toEqual({
        items: [
          expect.objectContaining({ id: commentIds[0], type: "comment", body: "older comment" }),
        ],
        nextCursor: null,
      });

      const changes = await app.inject(
        withWorkspace(
          { method: "GET", url: `/api/tasks/${task.id}/timeline?filter=changes&limit=1` },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      expect(changes.statusCode).toBe(200);
      const sortedChangeIds = [...changeIds].sort((a, b) => b.localeCompare(a));
      expect(changes.json().items).toEqual([
        expect.objectContaining({
          id: sortedChangeIds[0],
          type: "change",
          operationType: "field_changed",
        }),
      ]);
      expect(changes.json().nextCursor).toEqual(expect.any(String));
      expect(changes.json().items).not.toContainEqual(
        expect.objectContaining({ operationType: "task_created" }),
      );
      expect(changes.json().items).not.toContainEqual(
        expect.objectContaining({ operationType: "comment_edited" }),
      );

      const changesNextPage = await app.inject(
        withWorkspace(
          {
            method: "GET",
            url:
              `/api/tasks/${task.id}/timeline?filter=changes&limit=1&cursor=` +
              encodeURIComponent(changes.json().nextCursor as string),
          },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );
      expect(changesNextPage.statusCode).toBe(200);
      expect(changesNextPage.json()).toEqual({
        items: [
          expect.objectContaining({
            id: sortedChangeIds[1],
            type: "change",
            operationType: "field_changed",
          }),
        ],
        nextCursor: null,
      });
    } finally {
      await db.$executeRaw`DELETE FROM activity_logs WHERE task_id = ${task.id}`;
      await db.$executeRaw`DELETE FROM comments WHERE task_id = ${task.id}`;
      await hardDelete("tasks", [task.id]);
    }
  });

  it("GET /api/tasks/:id/timeline pages a mixed stream without loading every row", async () => {
    const task = await db.task.create({
      data: {
        title: `timeline-page-${randomUUID()}`,
        priority: "medium",
        workspaceId: workspaceA,
      },
    });
    const origin = new Date("2038-06-01T00:00:00.000Z");

    try {
      const comments = Array.from({ length: 15 }, (_, index) => {
        const occurredAt = new Date(origin.getTime() + index * 2_000);
        return {
          id: `tl-c-${index.toString().padStart(2, "0")}-${randomUUID()}`,
          taskId: task.id,
          authorUserId: memberId,
          body: `comment-${index}`,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        };
      });
      const changes = Array.from({ length: 15 }, (_, index) => {
        const occurredAt = new Date(origin.getTime() + index * 2_000 + 1_000);
        return {
          id: `tl-a-${index.toString().padStart(2, "0")}-${randomUUID()}`,
          taskId: task.id,
          actorUserId: memberId,
          operationType: "field_changed" as const,
          fieldName: "title" as const,
          beforeValue: `before-${index}`,
          afterValue: `after-${index}`,
          occurredAt,
        };
      });
      await db.comment.createMany({ data: comments });
      await db.activityLog.createMany({ data: changes });
      const expectedIds = [
        ...comments.map((comment) => ({ id: comment.id, occurredAt: comment.createdAt })),
        ...changes.map((change) => ({ id: change.id, occurredAt: change.occurredAt })),
      ]
        .sort((left, right) => {
          const timeDifference = right.occurredAt.getTime() - left.occurredAt.getTime();
          if (timeDifference !== 0) return timeDifference;
          return left.id < right.id ? 1 : -1;
        })
        .map((entry) => entry.id);

      const collected: string[] = [];
      let cursor: string | null = null;
      for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
        const response = await app.inject(
          withWorkspace(
            {
              method: "GET",
              url:
                `/api/tasks/${task.id}/timeline?filter=all&limit=10` +
                (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""),
            },
            memberCsrf.cookie,
            undefined,
            workspaceA,
          ),
        );
        expect(response.statusCode).toBe(200);
        const body = response.json() as {
          items: Array<{ id: string }>;
          nextCursor: string | null;
        };
        expect(body.items.length).toBeLessThanOrEqual(10);
        collected.push(...body.items.map((item) => item.id));
        cursor = body.nextCursor;
        if (!cursor) break;
      }

      expect(cursor).toBeNull();
      expect(collected).toEqual(expectedIds);
    } finally {
      await db.$executeRaw`DELETE FROM activity_logs WHERE task_id = ${task.id}`;
      await db.$executeRaw`DELETE FROM comments WHERE task_id = ${task.id}`;
      await hardDelete("tasks", [task.id]);
    }
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

  it("GET /api/tasks filters parent candidates by title, subtree, and closure state", async () => {
    const token = `parent-candidate-${randomUUID()}`;
    const completedStage = await db.developmentStage.findFirstOrThrow({
      where: { workspaceId: workspaceA, kind: "completed" },
    });
    const root = await db.task.create({
      data: { title: `${token}-root`, priority: "low", workspaceId: workspaceA },
    });
    const child = await db.task.create({
      data: {
        title: `${token}-child`,
        priority: "low",
        parentTaskId: root.id,
        workspaceId: workspaceA,
      },
    });
    const grandchild = await db.task.create({
      data: {
        title: `${token}-grandchild`,
        priority: "low",
        parentTaskId: child.id,
        workspaceId: workspaceA,
      },
    });
    const matchingOpen = await db.task.create({
      data: { title: `${token}-available`, priority: "low", workspaceId: workspaceA },
    });
    const matchingClosed = await db.task.create({
      data: {
        title: `${token}-closed`,
        priority: "low",
        developmentStageId: completedStage.id,
        workspaceId: workspaceA,
      },
    });
    const nonMatchingOpen = await db.task.create({
      data: { title: `other-${randomUUID()}`, priority: "low", workspaceId: workspaceA },
    });

    try {
      const response = await app.inject(
        withWorkspace(
          {
            method: "GET",
            url:
              `/api/tasks?titleContains=${encodeURIComponent(token)}` +
              `&excludeSubtreeOf=${root.id}&excludeClosed=true`,
          },
          memberCsrf.cookie,
          undefined,
          workspaceA,
        ),
      );

      expect(response.statusCode).toBe(200);
      expect(response.json().map((task: { id: string }) => task.id)).toEqual([matchingOpen.id]);
    } finally {
      await hardDelete("tasks", [
        grandchild.id,
        child.id,
        root.id,
        matchingOpen.id,
        matchingClosed.id,
        nonMatchingOpen.id,
      ]);
    }
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

  it("PATCH /api/tasks/:id updates parentTaskId and scheduledEndDate (task-detail 2.1, 2.2)", async () => {
    const parent = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "new parent", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const task = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "move under parent", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const parentId = parent.json().id as string;
    const taskId = task.json().id as string;

    const response = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${taskId}`,
          payload: { parentTaskId: parentId, scheduledEndDate: "2036-09-20" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    const body = response.json();
    const cleared = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${taskId}`,
          payload: { parentTaskId: null, scheduledEndDate: null },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    await hardDelete("tasks", [taskId, parentId]);
    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      parentTaskId: parentId,
      scheduledEndDate: "2036-09-20T00:00:00.000Z",
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({
      parentTaskId: null,
      scheduledEndDate: null,
    });
  });

  it("PATCH /api/tasks/:id rejects self and descendant parents as cycles (task-detail 2.5)", async () => {
    const parent = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "cycle parent", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const parentId = parent.json().id as string;
    const child = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "cycle child", priority: "low", parentTaskId: parentId },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const childId = child.json().id as string;
    const grandchild = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "cycle grandchild", priority: "low", parentTaskId: childId },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const grandchildId = grandchild.json().id as string;

    const selfResponse = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${parentId}`,
          payload: { parentTaskId: parentId },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const descendantResponse = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${parentId}`,
          payload: { parentTaskId: grandchildId },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    await hardDelete("tasks", [grandchildId, childId, parentId]);
    expect(selfResponse.statusCode).toBe(400);
    expect(selfResponse.json().error).toMatch(/cycle/i);
    expect(descendantResponse.statusCode).toBe(400);
    expect(descendantResponse.json().error).toMatch(/cycle/i);
  });

  it("PATCH /api/tasks/:id rejects a closed parent with 409 (task-detail 2.6)", async () => {
    const parent = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "closed update parent", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const task = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "child candidate", priority: "low" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const parentId = parent.json().id as string;
    const taskId = task.json().id as string;
    const completedStage = await db.developmentStage.create({
      data: {
        name: `completed-update-parent-${randomUUID()}`,
        order: 962,
        kind: "completed",
        workspaceId: workspaceA,
      },
    });
    const moved = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${parentId}/development-stage`,
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
          url: `/api/tasks/${taskId}`,
          payload: { parentTaskId: parentId },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    await hardDelete("tasks", [taskId, parentId]);
    await hardDelete("development_stages", [completedStage.id]);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/closed task cannot take children/i);
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

  // task-status-model 3.3: closed task split / closed parent → 409 (5.5, 5.6).
  it("POST /api/tasks/:id/split returns 409 when the task is on a completed stage (5.5)", async () => {
    const original = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "closed split", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const originalId = original.json().id as string;
    const completedStage = await db.developmentStage.create({
      data: {
        name: `completed-split-${randomUUID()}`,
        order: 960,
        kind: "completed",
        workspaceId: workspaceA,
      },
    });
    const moved = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${originalId}/development-stage`,
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

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/closed task cannot take children/i);

    const leakedParts =
      response.statusCode === 201
        ? (response.json() as { id: string }[]).map((p) => p.id)
        : [];
    await hardDelete("tasks", [...leakedParts, originalId]);
    await hardDelete("development_stages", [completedStage.id]);
  });

  it("POST /api/tasks returns 409 when parentTaskId is a completed-stage task (5.6)", async () => {
    const parent = await app.inject(
      withWorkspace(
        {
          method: "POST",
          url: "/api/tasks",
          payload: { title: "closed parent", priority: "medium" },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );
    const parentId = parent.json().id as string;
    const completedStage = await db.developmentStage.create({
      data: {
        name: `completed-parent-${randomUUID()}`,
        order: 961,
        kind: "completed",
        workspaceId: workspaceA,
      },
    });
    const moved = await app.inject(
      withWorkspace(
        {
          method: "PATCH",
          url: `/api/tasks/${parentId}/development-stage`,
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
          method: "POST",
          url: "/api/tasks",
          payload: {
            title: "child under closed",
            priority: "low",
            parentTaskId: parentId,
          },
        },
        memberCsrf.cookie,
        memberCsrf.token,
        workspaceA,
      ),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/closed task cannot take children/i);

    const leakedChild = response.statusCode === 201 ? [response.json().id as string] : [];
    await hardDelete("tasks", [...leakedChild, parentId]);
    await hardDelete("development_stages", [completedStage.id]);
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
    await expect(
      db.activityLog.findFirst({
        where: {
          taskId,
          operationType: "field_changed",
          fieldName: "developmentStage",
        },
      }),
    ).resolves.toMatchObject({
      actorUserId: memberId,
      beforeValue: null,
      afterValue: stage.id,
    });

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

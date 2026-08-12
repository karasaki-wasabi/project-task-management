import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { db } from "../../shared/db.js";
import { WORKSPACE_HEADER_NAME } from "../../shared/workspace-scope.js";

const testEnv = {
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CORS_ORIGIN: "http://localhost:3001",
  COOKIE_SECURE: false,
  LOG_LEVEL: "silent" as const,
  PORT: 3000,
};

interface Session {
  cookie: string;
  csrfToken: string;
  userId: string;
}

let app: FastifyInstance;
let owner: Session;
let otherMember: Session;
let workspaceId: string;
let taskId: string;
let deletedTaskId: string;
let otherWorkspaceId: string;
let otherWorkspaceTaskId: string;
const extraTaskIds: string[] = [];

function sessionCookie(response: { headers: Record<string, string | string[] | undefined> }): string {
  const setCookie = response.headers["set-cookie"];
  const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
    .find((item) => item?.startsWith("session="))
    ?.split(";")[0];
  if (!cookie) throw new Error("session cookie was not set");
  return cookie;
}

async function registerSession(label: string): Promise<Session> {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `comment-${label}-${randomUUID()}@example.test`,
      name: `コメント ${label}`,
      password: "password-123",
    },
  });
  expect(registerResponse.statusCode).toBe(201);

  const initialCookie = sessionCookie(registerResponse);
  const csrfResponse = await app.inject({
    method: "GET",
    url: "/api/auth/csrf",
    headers: { cookie: initialCookie },
  });
  expect(csrfResponse.statusCode).toBe(200);

  return {
    cookie: sessionCookie(csrfResponse),
    csrfToken: csrfResponse.json().token as string,
    userId: registerResponse.json().id as string,
  };
}

function injectAs(
  session: Session,
  options: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    url: string;
    payload?: unknown;
    workspace?: string;
  },
) {
  return app.inject({
    method: options.method,
    url: options.url,
    payload: options.payload,
    headers: {
      cookie: session.cookie,
      ...(options.method === "POST" || options.method === "PATCH" || options.method === "DELETE"
        ? { "csrf-token": session.csrfToken }
        : {}),
      [WORKSPACE_HEADER_NAME]: options.workspace ?? workspaceId,
    },
  });
}

async function createTask(title: string, workspace = workspaceId): Promise<string> {
  const response = await injectAs(owner, {
    method: "POST",
    url: "/api/tasks",
    payload: { title, priority: "medium" },
    workspace,
  });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

async function createComment(
  body = "最初のコメント",
  targetTaskId = taskId,
): Promise<Record<string, unknown>> {
  const response = await injectAs(owner, {
    method: "POST",
    url: `/api/tasks/${targetTaskId}/comments`,
    payload: { body },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as Record<string, unknown>;
}

beforeAll(async () => {
  app = buildApp(testEnv);
  owner = await registerSession("owner");
  otherMember = await registerSession("other");

  const workspaceResponse = await injectAs(owner, {
    method: "POST",
    url: "/api/workspaces",
    payload: { name: `comment-workspace-${randomUUID()}` },
    workspace: "",
  });
  expect(workspaceResponse.statusCode).toBe(201);
  workspaceId = workspaceResponse.json().id as string;

  const otherWorkspaceResponse = await injectAs(owner, {
    method: "POST",
    url: "/api/workspaces",
    payload: { name: `other-comment-workspace-${randomUUID()}` },
  });
  expect(otherWorkspaceResponse.statusCode).toBe(201);
  otherWorkspaceId = otherWorkspaceResponse.json().id as string;

  const memberResponse = await injectAs(owner, {
    method: "POST",
    url: `/api/workspaces/${workspaceId}/members`,
    payload: { userId: otherMember.userId },
  });
  expect(memberResponse.statusCode).toBe(201);

  taskId = await createTask(`comment-task-${randomUUID()}`);
  deletedTaskId = await createTask(`deleted-comment-task-${randomUUID()}`);
  otherWorkspaceTaskId = await createTask(`other-workspace-task-${randomUUID()}`, otherWorkspaceId);
  await db.task.delete({ where: { id: deletedTaskId } });
});

afterAll(async () => {
  if (taskId) {
    const allTaskIds = [taskId, deletedTaskId, otherWorkspaceTaskId, ...extraTaskIds];
    const placeholders = allTaskIds.map(() => "?").join(", ");
    await db.$executeRawUnsafe(`DELETE FROM activity_logs WHERE task_id IN (${placeholders})`, ...allTaskIds);
    await db.$executeRawUnsafe(`DELETE FROM comments WHERE task_id IN (${placeholders})`, ...allTaskIds);
    await db.$executeRawUnsafe(`DELETE FROM tasks WHERE id IN (${placeholders})`, ...allTaskIds);
  }
  if (workspaceId) {
    await db.$executeRawUnsafe(
      "DELETE FROM workspace_members WHERE workspace_id IN (?, ?)",
      workspaceId,
      otherWorkspaceId,
    );
    await db.$executeRawUnsafe(
      "DELETE FROM development_stages WHERE workspace_id IN (?, ?)",
      workspaceId,
      otherWorkspaceId,
    );
    await db.$executeRawUnsafe("DELETE FROM workspaces WHERE id IN (?, ?)", workspaceId, otherWorkspaceId);
  }
  if (owner?.userId && otherMember?.userId) {
    await db.$executeRawUnsafe("DELETE FROM users WHERE id IN (?, ?)", owner.userId, otherMember.userId);
  }
  await app?.close();
  await db.$disconnect();
});

describe("comment routes", () => {
  it("投稿者と投稿日時を伴うコメントを作成し、操作ログを記録する", async () => {
    const response = await injectAs(owner, {
      method: "POST",
      url: `/api/tasks/${taskId}/comments`,
      payload: { body: "投稿本文" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      taskId,
      authorUserId: owner.userId,
      body: "投稿本文",
      editedAt: null,
      deletedAt: null,
    });
    expect(response.json().createdAt).toEqual(expect.any(String));

    const log = await db.activityLog.findFirst({
      where: {
        taskId,
        actorUserId: owner.userId,
        operationType: "comment_created",
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(log).not.toBeNull();
  });

  it("空白文字のみの本文を拒否する", async () => {
    const response = await injectAs(owner, {
      method: "POST",
      url: `/api/tasks/${taskId}/comments`,
      payload: { body: " \n\t " },
    });

    expect(response.statusCode).toBe(400);
  });

  it("投稿者本人が編集でき、editedAt と操作ログを残す", async () => {
    const comment = await createComment();

    const response = await injectAs(owner, {
      method: "PATCH",
      url: `/api/tasks/${taskId}/comments/${comment.id as string}`,
      payload: { body: "編集後の本文" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: comment.id,
      taskId,
      authorUserId: owner.userId,
      body: "編集後の本文",
    });
    expect(response.json().editedAt).toEqual(expect.any(String));
    await expect(
      db.activityLog.findFirst({
        where: {
          taskId,
          actorUserId: owner.userId,
          operationType: "comment_edited",
        },
        orderBy: { occurredAt: "desc" },
      }),
    ).resolves.not.toBeNull();
  });

  it("投稿者以外の編集を拒否する", async () => {
    const comment = await createComment();

    const response = await injectAs(otherMember, {
      method: "PATCH",
      url: `/api/tasks/${taskId}/comments/${comment.id as string}`,
      payload: { body: "他人による編集" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("編集時も空白文字のみの本文を拒否する", async () => {
    const comment = await createComment();

    const response = await injectAs(owner, {
      method: "PATCH",
      url: `/api/tasks/${taskId}/comments/${comment.id as string}`,
      payload: { body: " \n\t " },
    });

    expect(response.statusCode).toBe(400);
  });

  it("投稿者本人が論理削除でき、操作ログを残す", async () => {
    const comment = await createComment();

    const response = await injectAs(owner, {
      method: "DELETE",
      url: `/api/tasks/${taskId}/comments/${comment.id as string}`,
    });

    expect(response.statusCode).toBe(204);
    await expect(
      db.comment.findFirst({
        where: { id: comment.id as string, deletedAt: { not: null } },
      }),
    ).resolves.toMatchObject({ id: comment.id });
    await expect(
      db.activityLog.findFirst({
        where: {
          taskId,
          actorUserId: owner.userId,
          operationType: "comment_deleted",
        },
        orderBy: { occurredAt: "desc" },
      }),
    ).resolves.not.toBeNull();
  });

  it("投稿者以外の削除を拒否する", async () => {
    const comment = await createComment();

    const response = await injectAs(otherMember, {
      method: "DELETE",
      url: `/api/tasks/${taskId}/comments/${comment.id as string}`,
    });

    expect(response.statusCode).toBe(403);
  });

  it("論理削除済みタスクへの投稿を拒否する", async () => {
    const response = await injectAs(owner, {
      method: "POST",
      url: `/api/tasks/${deletedTaskId}/comments`,
      payload: { body: "削除済みタスクへの投稿" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("論理削除済みタスクのコメントは編集も削除も拒否する", async () => {
    const targetTaskId = await createTask(`deleted-after-comment-${randomUUID()}`);
    extraTaskIds.push(targetTaskId);
    const comment = await createComment("削除前のコメント", targetTaskId);
    await db.task.delete({ where: { id: targetTaskId } });

    const updateResponse = await injectAs(owner, {
      method: "PATCH",
      url: `/api/tasks/${targetTaskId}/comments/${comment.id as string}`,
      payload: { body: "削除後の編集" },
    });
    const deleteResponse = await injectAs(owner, {
      method: "DELETE",
      url: `/api/tasks/${targetTaskId}/comments/${comment.id as string}`,
    });

    expect(updateResponse.statusCode).toBe(409);
    expect(deleteResponse.statusCode).toBe(409);
  });

  it("URL のタスクが現在のワークスペースに存在しない場合は拒否する", async () => {
    const response = await injectAs(owner, {
      method: "POST",
      url: `/api/tasks/${randomUUID()}/comments`,
      payload: { body: "存在しないタスク" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("別ワークスペースのタスクへの投稿を拒否する", async () => {
    const response = await injectAs(owner, {
      method: "POST",
      url: `/api/tasks/${otherWorkspaceTaskId}/comments`,
      payload: { body: "別ワークスペースへの投稿" },
    });

    expect(response.statusCode).toBe(404);
  });
});

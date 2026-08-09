import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { db } from "./shared/db.js";
import { withCsrfToken, withSessionCookie } from "./test/auth.fixture.js";

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
  const session = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((cookie) => cookie?.startsWith("session="));
  if (!session) throw new Error("session cookie was not set");
  return session.split(";")[0];
}

async function registerUser(app: ReturnType<typeof buildApp>, name = "アプリ結線") {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `app-auth-${randomUUID()}@example.test`,
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

async function csrfToken(
  app: ReturnType<typeof buildApp>,
  cookie: string,
): Promise<{ token: string; cookie: string }> {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/csrf",
    headers: { cookie },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ token: expect.any(String) });
  return { token: response.json().token, cookie: sessionCookie(response) };
}

afterAll(async () => {
  await db.$disconnect();
});

describe("app authentication integration", () => {
  it("rejects an unauthenticated business GET", async () => {
    const app = buildApp(env);

    const response = await app.inject({ method: "GET", url: "/api/tasks" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("registers without CSRF, establishes a session, and returns the current public user", async () => {
    const app = buildApp(env);
    let userId: string | undefined;
    try {
      const { user, cookie } = await registerUser(app);
      userId = user.id;

      const registerResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie },
      });

      expect(registerResponse.statusCode).toBe(200);
      expect(registerResponse.json()).toEqual(user);
    } finally {
      if (userId) await db.user.delete({ where: { id: userId } });
      await app.close();
    }
  });

  it("logs in without CSRF and exposes a fixed failure message for unknown email and wrong password", async () => {
    const app = buildApp(env);
    let userId: string | undefined;
    try {
      const { user } = await registerUser(app, "ログイン検証");
      userId = user.id;

      const unknownEmailResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: `unknown-${randomUUID()}@example.test`,
          password: "password-123",
        },
      });
      const wrongPasswordResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: user.email,
          password: "wrong-password",
        },
      });
      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: user.email,
          password: "password-123",
        },
      });

      expect(unknownEmailResponse.statusCode).toBe(401);
      expect(wrongPasswordResponse.statusCode).toBe(401);
      expect(unknownEmailResponse.json()).toEqual(wrongPasswordResponse.json());
      expect(unknownEmailResponse.json()).toEqual({
        error: "メールアドレスまたはパスワードが正しくありません。",
      });
      expect(loginResponse.statusCode).toBe(200);
      expect(loginResponse.json()).toEqual(user);

      const meResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookie(loginResponse) },
      });
      expect(meResponse.statusCode).toBe(200);
      expect(meResponse.json()).toEqual(user);
    } finally {
      if (userId) await db.user.delete({ where: { id: userId } });
      await app.close();
    }
  });

  it("requires CSRF for logout, then clears the session", async () => {
    const app = buildApp(env);
    let userId: string | undefined;
    try {
      const { user, cookie } = await registerUser(app, "ログアウト検証");
      userId = user.id;

      const noCsrfResponse = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie },
      });
      expect(noCsrfResponse.statusCode).toBe(403);

      const csrf = await csrfToken(app, cookie);
      const logoutResponse = await app.inject(
        withCsrfToken(
          withSessionCookie({ method: "POST", url: "/api/auth/logout" }, csrf.cookie),
          csrf.token,
        ),
      );
      expect(logoutResponse.statusCode).toBe(204);

      const meResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: sessionCookie(logoutResponse) },
      });
      expect(meResponse.statusCode).toBe(401);
    } finally {
      if (userId) await db.user.delete({ where: { id: userId } });
      await app.close();
    }
  });

  it("issues CSRF tokens publicly but rejects unprotected business and client-error mutations", async () => {
    const app = buildApp(env);
    let userId: string | undefined;
    try {
      const publicCsrfResponse = await app.inject({ method: "GET", url: "/api/auth/csrf" });
      expect(publicCsrfResponse.statusCode).toBe(200);
      expect(publicCsrfResponse.json()).toEqual({ token: expect.any(String) });

      const { user, cookie } = await registerUser(app, "CSRF検証");
      userId = user.id;

      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { cookie },
        payload: { title: "CSRFなし", priority: "low" },
      });

      expect(response.statusCode).toBe(403);

      const clientErrorsResponse = await app.inject({
        method: "POST",
        url: "/api/client-errors",
        payload: {
          message: "CSRFなし",
          pageUrl: "http://localhost:3001/",
          occurredAt: new Date().toISOString(),
        },
      });
      expect(clientErrorsResponse.statusCode).toBe(403);
    } finally {
      if (userId) await db.user.delete({ where: { id: userId } });
      await app.close();
    }
  });

  it("provides users only as an authenticated list and has no create or delete routes", async () => {
    const app = buildApp(env);
    let userId: string | undefined;
    try {
      const { user, cookie } = await registerUser(app, "ユーザー一覧検証");
      userId = user.id;
      const csrf = await csrfToken(app, cookie);

      const listResponse = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { cookie },
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toContainEqual(expect.objectContaining({ id: user.id, name: user.name }));

      const createResponse = await app.inject(
        withCsrfToken(
          withSessionCookie(
            { method: "POST", url: "/api/users", payload: { name: "旧ユーザー" } },
            csrf.cookie,
          ),
          csrf.token,
        ),
      );
      const deleteResponse = await app.inject(
        withCsrfToken(
          withSessionCookie({ method: "DELETE", url: `/api/users/${user.id}` }, csrf.cookie),
          csrf.token,
        ),
      );
      expect(createResponse.statusCode).toBe(404);
      expect(deleteResponse.statusCode).toBe(404);
    } finally {
      if (userId) await db.user.delete({ where: { id: userId } });
      await app.close();
    }
  });
});

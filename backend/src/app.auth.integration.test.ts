import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { db } from "./shared/db.js";

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

afterAll(async () => {
  await db.$disconnect();
});

describe("app authentication wiring (task 3)", () => {
  it("rejects an unauthenticated business GET", async () => {
    const app = buildApp(env);

    const response = await app.inject({ method: "GET", url: "/api/tasks" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("establishes a reusable session when registering, allowing GET /api/auth/me", async () => {
    const app = buildApp(env);
    let userId: string | undefined;
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: `app-auth-${randomUUID()}@example.test`,
          name: "アプリ結線",
          password: "password-123",
        },
      });
      userId = response.json().id;

      expect(response.statusCode).toBe(201);
      const responseCookie = sessionCookie(response);
      expect(response.headers["set-cookie"]).toContain("HttpOnly");
      expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
      expect(response.headers["set-cookie"]).toContain("Max-Age=604800");

      const meResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: responseCookie },
      });
      expect(meResponse.statusCode).toBe(200);
      expect(meResponse.json()).toMatchObject({ id: userId });
    } finally {
      if (userId) await db.user.delete({ where: { id: userId } });
      await app.close();
    }
  });

  it("rejects a business POST without a CSRF token", async () => {
    const app = buildApp(env);
    let userId: string | undefined;
    try {
      const registerResponse = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: `app-csrf-${randomUUID()}@example.test`,
          name: "CSRF検証",
          password: "password-123",
        },
      });
      userId = registerResponse.json().id;

      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { cookie: sessionCookie(registerResponse) },
        payload: { title: "CSRFなし", priority: "low" },
      });

      expect(response.statusCode).toBe(403);
    } finally {
      if (userId) await db.user.delete({ where: { id: userId } });
      await app.close();
    }
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { buildApp } from "../../app.js";
import { createUserData } from "../../test/user.fixture.js";

async function hardDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

function buildTestApp() {
  return buildApp({
    DATABASE_URL: "mysql://user:pass@localhost:3306/db",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    CORS_ORIGIN: "http://localhost:3001",
    COOKIE_SECURE: false,
    LOG_LEVEL: "error",
    PORT: 3000,
  });
}

afterAll(async () => {
  await db.$disconnect();
});

describe("userRoutes", () => {
  it("requires login and lists accounts as PublicUser values", async () => {
    const app = await buildTestApp();
    const data = createUserData(`候補-${randomUUID()}`);
    const candidate = await db.user.create({ data });
    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: `route-${randomUUID()}@example.test`,
        name: "ログイン利用者",
        password: "password-123",
      },
    });
    const registered = registerResponse.json();
    const setCookie = registerResponse.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .find((item) => item?.startsWith("session="))
      ?.split(";")[0];

    const unauthenticatedResponse = await app.inject({ method: "GET", url: "/api/users" });
    expect(unauthenticatedResponse.statusCode).toBe(401);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { cookie },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toContainEqual({
      id: candidate.id,
      email: data.email,
      name: data.name,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
    });
    expect(listResponse.json().find((user: { id: string }) => user.id === candidate.id)).not.toHaveProperty("passwordHash");

    await hardDelete([candidate.id, registered.id]);
    await app.close();
  });

  it("does not register the legacy create and delete routes", async () => {
    const app = await buildTestApp();
    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: `removed-route-${randomUUID()}@example.test`,
        name: "ルート確認利用者",
        password: "password-123",
      },
    });
    const registered = registerResponse.json();
    const setCookie = registerResponse.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .find((item) => item?.startsWith("session="))
      ?.split(";")[0];
    const csrfResponse = await app.inject({
      method: "GET",
      url: "/api/auth/csrf",
      headers: { cookie },
    });
    const csrfCookie = csrfResponse.headers["set-cookie"];
    const authenticatedCookie =
      (Array.isArray(csrfCookie) ? csrfCookie : [csrfCookie]).find((item) => item?.startsWith("session="))?.split(";")[0] ??
      cookie;
    const headers = { cookie: authenticatedCookie, "csrf-token": csrfResponse.json().token };

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: `legacy-${randomUUID()}` },
      headers,
    });
    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/users/${randomUUID()}`,
      headers,
    });

    expect(createResponse.statusCode).toBe(404);
    expect(deleteResponse.statusCode).toBe(404);
    await hardDelete([registered.id]);
    await app.close();
  });
});

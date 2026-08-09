import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { createUserData } from "../../test/user.fixture.js";
import { authRoutes } from "./auth.routes.js";
import { authService } from "./auth.service.js";

interface TestSession {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(): void;
}

const createdUserIds: string[] = [];

async function buildTestApp() {
  const app = Fastify({ logger: false });
  let sessionValues = new Map<string, unknown>();

  app.decorateRequest("session", null);
  app.decorateReply("generateCsrf", () => "csrf-token");
  app.addHook("onRequest", (request, _reply, done) => {
    (request as unknown as { session: TestSession }).session = {
      get: (key) => sessionValues.get(key),
      set: (key, value) => sessionValues.set(key, value),
      delete: () => {
        sessionValues = new Map();
      },
    };
    done();
  });
  await app.register(authRoutes);
  return app;
}

afterEach(async () => {
  if (createdUserIds.length === 0) return;

  await db.$executeRawUnsafe(
    `DELETE FROM users WHERE id IN (${createdUserIds.map(() => "?").join(",")})`,
    ...createdUserIds,
  );
  createdUserIds.length = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("authRoutes (task 2.2)", () => {
  it("POST /api/auth/register creates a user, returns 201, and establishes a session", async () => {
    const app = await buildTestApp();
    const data = createUserData(`登録-${randomUUID()}`);

    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { ...data, password: "password-123" },
    });
    const registered = registerResponse.json();
    createdUserIds.push(registered.id);

    expect(registerResponse.statusCode).toBe(201);
    expect(registered).toMatchObject({ email: data.email, name: data.name });
    expect(registered).not.toHaveProperty("passwordHash");

    const meResponse = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({ id: registered.id });
    await app.close();
  });

  it("POST /api/auth/login establishes a session for valid credentials", async () => {
    const app = await buildTestApp();
    const data = createUserData(`ログイン-${randomUUID()}`);
    const password = "password-123";
    const user = await authService.register({ ...data, password });
    createdUserIds.push(user.id);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: data.email, password },
    });

    expect(response.statusCode).toBe(200);

    const meResponse = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({ id: user.id });
    await app.close();
  });

  it("POST /api/auth/logout destroys the current session", async () => {
    const app = await buildTestApp();
    const data = createUserData(`ログアウト-${randomUUID()}`);
    const registerResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { ...data, password: "password-123" },
    });
    createdUserIds.push(registerResponse.json().id);

    const logoutResponse = await app.inject({ method: "POST", url: "/api/auth/logout" });
    expect(logoutResponse.statusCode).toBe(204);

    const meResponse = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(meResponse.statusCode).toBe(401);
    await app.close();
  });

  it("GET /api/auth/me returns 401 without a session", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/auth/me" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("GET /api/auth/csrf returns a CSRF token without authentication", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/auth/csrf" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ token: "csrf-token" });
    await app.close();
  });
});

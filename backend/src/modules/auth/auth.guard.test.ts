import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { requireUser } from "./auth.guard.js";
import { authService } from "./auth.service.js";

interface TestSession {
  get<T>(key: string): T | undefined;
  delete(): void;
}

const createdUserIds: string[] = [];

async function buildTestApp(userId: unknown) {
  const app = Fastify({ logger: false });
  let sessionUserId = userId;

  app.decorateRequest("session", null);
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", (request, _reply, done) => {
    (request as unknown as { session: TestSession }).session = {
      get: <T>(key: string) => (key === "userId" ? (sessionUserId as T | undefined) : undefined),
      delete: () => {
        sessionUserId = undefined;
      },
    };
    done();
  });
  app.get("/protected", { preHandler: requireUser }, (request) => request.currentUser);
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

describe("requireUser (task 2.3)", () => {
  it("有効なセッションの userId からパブリックユーザーを紐付ける", async () => {
    const uniqueId = randomUUID();
    const user = await authService.register({
      email: `guard-${uniqueId}@example.test`,
      name: `ガード-${uniqueId}`,
      password: "password-123",
    });
    createdUserIds.push(user.id);
    const app = await buildTestApp(user.id);

    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(user);
    await app.close();
  });

  it.each([
    ["セッションがない", undefined],
    ["セッションの userId が無効", 123],
    ["セッションのユーザーが存在しない", randomUUID()],
  ])("%s の場合、401 を返す", async (_description, userId) => {
    const app = await buildTestApp(userId);

    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

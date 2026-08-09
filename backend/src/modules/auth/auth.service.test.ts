import { randomUUID } from "node:crypto";
import { verify } from "@node-rs/argon2";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { createUserData } from "../../test/user.fixture.js";
import { authService } from "./auth.service.js";

const createdUserIds: string[] = [];

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

describe("authService", () => {
  it("normalizes email, hashes password, and returns a PublicUser on registration", async () => {
    const data = createUserData(`表示名-${randomUUID()}`);
    const password = "password-123";

    const user = await authService.register({
      email: `  ${data.email.toUpperCase()}  `,
      name: `  ${data.name}  `,
      password,
    });
    createdUserIds.push(user.id);

    expect(user).toMatchObject({
      id: expect.any(String),
      email: data.email,
      name: data.name,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(user).not.toHaveProperty("passwordHash");

    const persisted = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verify(persisted.passwordHash, password)).toBe(true);
  });

  it("rejects a duplicate normalized email", async () => {
    const data = createUserData(`重複-${randomUUID()}`);
    const password = "password-123";
    const registered = await authService.register({ ...data, password });
    createdUserIds.push(registered.id);

    await expect(
      authService.register({
        email: ` ${data.email.toUpperCase()} `,
        name: "別の表示名",
        password,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "このメールアドレスはすでに登録されています。",
    });
  });

  it("rejects an invalid email address", async () => {
    const data = createUserData(`不正メール-${randomUUID()}`);

    await expect(
      authService.register({ ...data, email: "invalid-email", password: "password-123" }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects passwords shorter than eight characters", async () => {
    const data = createUserData(`短いパスワード-${randomUUID()}`);

    await expect(authService.register({ ...data, password: "short" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects blank display names", async () => {
    const data = createUserData(`空白名-${randomUUID()}`);

    await expect(authService.register({ ...data, name: " \t " })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("authenticates a registered user and never exposes passwordHash", async () => {
    const data = createUserData(`ログイン-${randomUUID()}`);
    const password = "password-123";
    const registered = await authService.register({ ...data, password });
    createdUserIds.push(registered.id);

    await expect(
      authService.login({ email: ` ${data.email.toUpperCase()} `, password }),
    ).resolves.toEqual(registered);
  });

  it("returns the same fixed error for unknown email and invalid password", async () => {
    const data = createUserData(`失敗-${randomUUID()}`);
    const password = "password-123";
    const registered = await authService.register({ ...data, password });
    createdUserIds.push(registered.id);

    const unknownEmailError = await authService.login({
      email: `unknown-${randomUUID()}@example.test`,
      password,
    }).catch((error: unknown) => error);
    const invalidPasswordError = await authService.login({
      email: data.email,
      password: "incorrect-password",
    }).catch((error: unknown) => error);

    expect(unknownEmailError).toMatchObject({
      statusCode: 401,
      message: "メールアドレスまたはパスワードが正しくありません。",
    });
    expect(invalidPasswordError).toMatchObject({
      statusCode: 401,
      message: "メールアドレスまたはパスワードが正しくありません。",
    });
  });

  it("returns a public user by id or null when absent", async () => {
    const data = createUserData(`取得-${randomUUID()}`);
    const registered = await authService.register({ ...data, password: "password-123" });
    createdUserIds.push(registered.id);

    await expect(authService.getPublicUser(registered.id)).resolves.toEqual(registered);
    await expect(authService.getPublicUser(randomUUID())).resolves.toBeNull();
  });
});

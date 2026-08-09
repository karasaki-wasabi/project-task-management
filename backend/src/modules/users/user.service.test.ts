// RED: usersService does not exist yet (task 2.1, Requirements 7.1, 7.3, 9.1-9.4).
// Integration test against real MySQL (via shared/db.ts) since the behavior
// under test includes the soft-delete Repository convention from task 1.4.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { usersService } from "./user.service.js";

afterAll(async () => {
  await db.$disconnect();
});

// The soft-delete extension redirects `.deleteMany()` to an UPDATE, so test
// cleanup uses a raw physical DELETE to avoid leaving junk rows behind.
async function hardDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

describe("usersService (task 2.1)", () => {
  it("creates a user and returns it with audit timestamps", async () => {
    const name = `user-${randomUUID()}`;
    const user = await usersService.create(name);

    expect(user.name).toBe(name);
    expect(user.email).toMatch(/^legacy-user-[\w-]+@example\.invalid$/);
    expect(user.passwordHash).toMatch(/^legacy-user-create-path-/);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
    expect(user.deletedAt).toBeNull();

    await hardDelete([user.id]);
  });

  it("rejects an empty name (Requirement: UsersService 'name'は空文字不可)", async () => {
    await expect(usersService.create("")).rejects.toMatchObject({ statusCode: 400 });
    await expect(usersService.create("   ")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lists users, excluding soft-deleted ones (Requirement 9.4)", async () => {
    const marker = `list-${randomUUID()}`;
    const kept = await usersService.create(`${marker}-kept`);
    const removed = await usersService.create(`${marker}-removed`);
    await usersService.delete(removed.id);

    const list = await usersService.list();

    expect(list.some((u) => u.id === kept.id)).toBe(true);
    expect(list.some((u) => u.id === removed.id)).toBe(false);

    await hardDelete([kept.id, removed.id]);
  });

  it("soft-deletes a user: physical row remains with deleted_at set (Requirement 9.3)", async () => {
    const user = await usersService.create(`user-${randomUUID()}`);

    await usersService.delete(user.id);

    const rawRow = await db.user.findFirst({ where: { id: user.id, deletedAt: { not: null } } });
    expect(rawRow).not.toBeNull();
    expect(rawRow?.deletedAt).not.toBeNull();

    await hardDelete([user.id]);
  });

  it("rejects deleting a user that does not exist with a 404-shaped error", async () => {
    await expect(usersService.delete(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });
});

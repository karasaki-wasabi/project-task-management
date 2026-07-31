// RED: withSoftDelete() does not exist yet (task 1.4, Requirements 9.1-9.5).
// This is an integration test against a real MySQL instance because the
// behavior under test is a Prisma Client Extension, which only takes effect
// through actual query execution.
// Run inside the backend container: `docker compose run --rm -T backend npx vitest run soft-delete`
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withSoftDelete } from "./soft-delete.repository.js";

const rawPrisma = new PrismaClient();
const db = withSoftDelete(rawPrisma);

afterAll(async () => {
  await rawPrisma.$disconnect();
});

describe("withSoftDelete (task 1.4)", () => {
  it("bumps updated_at on update()", async () => {
    const user = await db.user.create({ data: { name: `u-${randomUUID()}` } });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await db.user.update({ where: { id: user.id }, data: { name: "renamed" } });

    expect(updated.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });

  it("bumps updated_at on updateMany(), which Prisma's own @updatedAt does not cover", async () => {
    const user = await db.user.create({ data: { name: `u-${randomUUID()}` } });
    await new Promise((resolve) => setTimeout(resolve, 10));

    await db.user.updateMany({ where: { id: user.id }, data: { name: "renamed-many" } });
    const reloaded = await rawPrisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(reloaded.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });

  it("delete() issues a soft delete (UPDATE deleted_at) instead of a physical DELETE", async () => {
    const user = await db.user.create({ data: { name: `u-${randomUUID()}` } });

    const result = await db.user.delete({ where: { id: user.id } });

    expect(result.deletedAt).not.toBeNull();

    const rawRow = await rawPrisma.user.findUnique({ where: { id: user.id } });
    expect(rawRow).not.toBeNull();
    expect(rawRow?.deletedAt).not.toBeNull();

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });

  it("deleteMany() issues soft deletes for every matching row", async () => {
    const marker = `batch-${randomUUID()}`;
    const a = await db.user.create({ data: { name: marker } });
    const b = await db.user.create({ data: { name: marker } });

    const result = await db.user.deleteMany({ where: { name: marker } });

    expect(result.count).toBe(2);
    const rawRows = await rawPrisma.user.findMany({ where: { name: marker } });
    expect(rawRows).toHaveLength(2);
    expect(rawRows.every((row) => row.deletedAt !== null)).toBe(true);

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id IN (${a.id}, ${b.id})`;
  });

  it("excludes soft-deleted rows from findMany/findFirst/count by default", async () => {
    const marker = `find-${randomUUID()}`;
    const kept = await db.user.create({ data: { name: marker } });
    const removed = await db.user.create({ data: { name: marker } });
    await db.user.delete({ where: { id: removed.id } });

    const list = await db.user.findMany({ where: { name: marker } });
    const first = await db.user.findFirst({ where: { id: removed.id } });
    const count = await db.user.count({ where: { name: marker } });

    expect(list.map((u) => u.id)).toEqual([kept.id]);
    expect(first).toBeNull();
    expect(count).toBe(1);

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id IN (${kept.id}, ${removed.id})`;
  });

  it("excludes soft-deleted rows from findUnique/findUniqueOrThrow by default", async () => {
    const user = await db.user.create({ data: { name: `unique-${randomUUID()}` } });
    await db.user.delete({ where: { id: user.id } });

    const found = await db.user.findUnique({ where: { id: user.id } });
    expect(found).toBeNull();

    await expect(db.user.findUniqueOrThrow({ where: { id: user.id } })).rejects.toThrow();

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });

  it("still lets callers explicitly query soft-deleted rows when they ask for deletedAt: { not: null }", async () => {
    const user = await db.user.create({ data: { name: `explicit-${randomUUID()}` } });
    await db.user.delete({ where: { id: user.id } });

    const found = await db.user.findFirst({ where: { id: user.id, deletedAt: { not: null } } });

    expect(found?.id).toBe(user.id);

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });
});

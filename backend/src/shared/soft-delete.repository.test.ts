import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createUserData } from "../test/user.fixture.js";
import { withSoftDelete } from "./soft-delete.repository.js";

const rawPrisma = new PrismaClient();
const db = withSoftDelete(rawPrisma);

afterAll(async () => {
  await rawPrisma.$disconnect();
});

describe("withSoftDelete (task 1.4)", () => {
  it("update() で updated_at を更新する", async () => {
    const user = await db.user.create({ data: createUserData(`u-${randomUUID()}`) });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await db.user.update({ where: { id: user.id }, data: { name: "renamed" } });

    expect(updated.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });

  it("updateMany() で updated_at を更新する。Prisma の @updatedAt ではカバーされない", async () => {
    const user = await db.user.create({ data: createUserData(`u-${randomUUID()}`) });
    await new Promise((resolve) => setTimeout(resolve, 10));

    await db.user.updateMany({ where: { id: user.id }, data: { name: "renamed-many" } });
    const reloaded = await rawPrisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(reloaded.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });

  it("delete() で論理削除 (UPDATE deleted_at) を実行する。物理削除は行われない", async () => {
    const user = await db.user.create({ data: createUserData(`u-${randomUUID()}`) });

    const result = await db.user.delete({ where: { id: user.id } });

    expect(result.deletedAt).not.toBeNull();

    const rawRow = await rawPrisma.user.findUnique({ where: { id: user.id } });
    expect(rawRow).not.toBeNull();
    expect(rawRow?.deletedAt).not.toBeNull();

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });

  it("すべてのマッチング行に対して deleteMany() で論理削除を行う。", async () => {
    const marker = `batch-${randomUUID()}`;
    const a = await db.user.create({ data: createUserData(marker) });
    const b = await db.user.create({ data: createUserData(marker) });

    const result = await db.user.deleteMany({ where: { name: marker } });

    expect(result.count).toBe(2);
    const rawRows = await rawPrisma.user.findMany({ where: { name: marker } });
    expect(rawRows).toHaveLength(2);
    expect(rawRows.every((row) => row.deletedAt !== null)).toBe(true);

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id IN (${a.id}, ${b.id})`;
  });

  it("findMany/findFirst/count で論理削除された行を除外する", async () => {
    const marker = `find-${randomUUID()}`;
    const kept = await db.user.create({ data: createUserData(marker) });
    const removed = await db.user.create({ data: createUserData(marker) });
    await db.user.delete({ where: { id: removed.id } });

    const list = await db.user.findMany({ where: { name: marker } });
    const first = await db.user.findFirst({ where: { id: removed.id } });
    const count = await db.user.count({ where: { name: marker } });

    expect(list.map((u) => u.id)).toEqual([kept.id]);
    expect(first).toBeNull();
    expect(count).toBe(1);

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id IN (${kept.id}, ${removed.id})`;
  });

  it("findUnique/findUniqueOrThrow で論理削除された行を除外する", async () => {
    const user = await db.user.create({ data: createUserData(`unique-${randomUUID()}`) });
    await db.user.delete({ where: { id: user.id } });

    const found = await db.user.findUnique({ where: { id: user.id } });
    expect(found).toBeNull();

    await expect(db.user.findUniqueOrThrow({ where: { id: user.id } })).rejects.toThrow();

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });

  it("deletedAt: { not: null } を指定すると論理削除された行を明示的にクエリできる", async () => {
    const user = await db.user.create({ data: createUserData(`explicit-${randomUUID()}`) });
    await db.user.delete({ where: { id: user.id } });

    const found = await db.user.findFirst({ where: { id: user.id, deletedAt: { not: null } } });

    expect(found?.id).toBe(user.id);

    await rawPrisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
  });
});

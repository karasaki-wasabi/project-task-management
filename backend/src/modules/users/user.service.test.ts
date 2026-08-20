import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { createUserData } from "../../test/user.fixture.js";
import { usersService } from "./user.service.js";

afterAll(async () => {
  await db.$disconnect();
});

async function hardDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

describe("usersService", () => {
  it("usersService.list で registered accounts を PublicUser 値として返す、passwordHash はなし", async () => {
    const data = createUserData(`表示名-${randomUUID()}`);
    const user = await db.user.create({ data });

    const list = await usersService.list();
    const listed = list.find((item) => item.id === user.id);

    expect(listed).toEqual({
      id: user.id,
      email: data.email,
      name: data.name,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
    expect(listed).not.toHaveProperty("passwordHash");

    await hardDelete([user.id]);
  });

  it("usersService.search で case-insensitive name または email 部分文字列を検索し、registered accounts を返す", async () => {
    const marker = randomUUID().replace(/-/g, "").slice(0, 12);
    const byName = await db.user.create({
      data: createUserData(`AlphaSearch-${marker}`),
    });
    const byEmail = await db.user.create({
      data: {
        ...createUserData(`Other-${marker}`),
        email: `match-${marker}@Example.TEST`,
      },
    });
    const unrelated = await db.user.create({
      data: createUserData(`Unrelated-${randomUUID()}`),
    });

    const byNameResults = await usersService.search(`alphasearch-${marker}`);
    expect(byNameResults.map((user) => user.id)).toEqual([byName.id]);
    expect(byNameResults[0]).not.toHaveProperty("passwordHash");

    const byEmailResults = await usersService.search(`MATCH-${marker}@example.test`);
    expect(byEmailResults.map((user) => user.id)).toEqual([byEmail.id]);

    const emptyAfterTrim = await usersService.search("   ");
    expect(emptyAfterTrim).toEqual([]);

    await hardDelete([byName.id, byEmail.id, unrelated.id]);
  });
});

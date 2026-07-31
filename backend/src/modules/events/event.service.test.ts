// RED: eventsService does not exist yet (task 5.1, Requirements 4.1-4.3, 7.2,
// 9.1-9.4). Integration test against real MySQL via shared/db.ts.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { eventsService } from "./event.service.js";

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

afterAll(async () => {
  await db.$disconnect();
});

describe("eventsService (task 5.1)", () => {
  it("creates an event holding title and occursAt (Requirement 4.1)", async () => {
    const occursAt = new Date("2026-09-01T10:00:00.000Z");
    const event = await eventsService.create({ title: "kickoff meeting", occursAt });

    expect(event.title).toBe("kickoff meeting");
    expect(event.occursAt.getTime()).toBe(occursAt.getTime());
    // Requirement 4.3: events never carry a task-like status field.
    expect(event).not.toHaveProperty("status");

    await hardDelete("events", [event.id]);
  });

  it("rejects an empty title", async () => {
    await expect(eventsService.create({ title: "", occursAt: new Date() })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects an invalid occursAt", async () => {
    await expect(
      eventsService.create({ title: "bad date", occursAt: new Date("not-a-date") }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lists events, excluding soft-deleted ones (Requirement 9.4)", async () => {
    const marker = `list-${randomUUID()}`;
    const kept = await eventsService.create({ title: `${marker}-kept`, occursAt: new Date("2026-09-01") });
    const removed = await eventsService.create({ title: `${marker}-removed`, occursAt: new Date("2026-09-02") });
    await eventsService.delete(removed.id);

    const list = await eventsService.list({});

    expect(list.some((e) => e.id === kept.id)).toBe(true);
    expect(list.some((e) => e.id === removed.id)).toBe(false);

    await hardDelete("events", [kept.id, removed.id]);
  });

  it("filters the list by assigneeUserId (Requirement 7.2)", async () => {
    const user = await db.user.create({ data: { name: `u-${randomUUID()}` } });
    const matching = await eventsService.create({
      title: "matches filter",
      occursAt: new Date("2026-09-01"),
      assigneeUserId: user.id,
    });
    const nonMatching = await eventsService.create({ title: "does not match", occursAt: new Date("2026-09-01") });

    const filtered = await eventsService.list({ assigneeUserId: user.id });

    expect(filtered.map((e) => e.id)).toEqual([matching.id]);

    await hardDelete("events", [matching.id, nonMatching.id]);
    await hardDelete("users", [user.id]);
  });

  it("soft-deletes an event: physical row remains with deleted_at set (Requirement 9.3)", async () => {
    const event = await eventsService.create({ title: "delete me", occursAt: new Date("2026-09-01") });

    await eventsService.delete(event.id);

    const rawRow = await db.event.findFirst({ where: { id: event.id, deletedAt: { not: null } } });
    expect(rawRow).not.toBeNull();

    await hardDelete("events", [event.id]);
  });

  it("returns not_found (404) when deleting a non-existent event", async () => {
    await expect(eventsService.delete(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });
});

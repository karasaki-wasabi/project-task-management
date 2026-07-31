// RED: holidaysService does not exist yet (task 6.1, Requirements 8.1, 8.2,
// 9.1-9.4). Integration test against real MySQL via shared/db.ts.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import { holidaysService } from "./holiday.service.js";

const registeredDates: string[] = [];

async function hardDeleteAll(): Promise<void> {
  if (registeredDates.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM non_business_days WHERE date IN (${registeredDates.map(() => "?").join(",")})`,
      ...registeredDates,
    );
  }
  registeredDates.length = 0;
}

afterEach(async () => {
  await hardDeleteAll();
});

afterAll(async () => {
  await db.$disconnect();
});

function trackedDate(offsetDays: number): string {
  const base = new Date("2031-11-01T00:00:00.000Z");
  base.setUTCDate(base.getUTCDate() + offsetDays);
  const date = base.toISOString().slice(0, 10);
  registeredDates.push(date);
  return date;
}

describe("holidaysService (task 6.1)", () => {
  it("registers a non-business day with a date and label (Requirement 8.1)", async () => {
    const date = trackedDate(1);

    const holiday = await holidaysService.register({ date, label: "文化の日" });

    expect(holiday.date).toBe(date);
    expect(holiday.label).toBe("文化の日");
    expect(holiday.source).toBe("manual");
  });

  it("rejects an invalid date", async () => {
    await expect(holidaysService.register({ date: "not-a-date" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects registering the same active date twice (409)", async () => {
    const date = trackedDate(2);
    await holidaysService.register({ date });

    await expect(holidaysService.register({ date })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("allows re-registering a date after the original record was removed", async () => {
    const date = trackedDate(3);
    const first = await holidaysService.register({ date });
    await holidaysService.remove(first.id);

    const second = await holidaysService.register({ date, label: "re-registered" });

    expect(second.date).toBe(date);
  });

  it("lists non-business days, excluding removed ones (Requirement 9.4)", async () => {
    const kept = trackedDate(4);
    const removed = trackedDate(5);
    const keptHoliday = await holidaysService.register({ date: kept });
    const removedHoliday = await holidaysService.register({ date: removed });
    await holidaysService.remove(removedHoliday.id);

    const list = await holidaysService.list();

    expect(list.some((h) => h.id === keptHoliday.id)).toBe(true);
    expect(list.some((h) => h.id === removedHoliday.id)).toBe(false);
  });

  it("returns not_found (404) when removing a non-existent holiday", async () => {
    await expect(holidaysService.remove(randomUUID())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("isBusinessDay is false for a registered date and true otherwise", async () => {
    const holiday = trackedDate(6);
    const businessDay = trackedDate(7);
    await holidaysService.register({ date: holiday });

    expect(await holidaysService.isBusinessDay(holiday)).toBe(false);
    expect(await holidaysService.isBusinessDay(businessDay)).toBe(true);
  });

  it("nextBusinessDay skips over a single holiday", async () => {
    const holiday = trackedDate(10);
    await holidaysService.register({ date: holiday });

    // trackedDate(10) is the day right after the input date below.
    const inputDate = trackedDate(9);
    const next = await holidaysService.nextBusinessDay(inputDate);

    expect(next).toBe(trackedDate(11));
  });

  it("nextBusinessDay steps over multiple consecutive holidays until a non-holiday day is found", async () => {
    const inputDate = trackedDate(20);
    await holidaysService.register({ date: trackedDate(21) });
    await holidaysService.register({ date: trackedDate(22) });
    await holidaysService.register({ date: trackedDate(23) });

    const next = await holidaysService.nextBusinessDay(inputDate);

    expect(next).toBe(trackedDate(24));
  });

  it("previousBusinessDay steps back over multiple consecutive holidays until a non-holiday day is found", async () => {
    const inputDate = trackedDate(40);
    await holidaysService.register({ date: trackedDate(39) });
    await holidaysService.register({ date: trackedDate(38) });
    await holidaysService.register({ date: trackedDate(37) });

    const previous = await holidaysService.previousBusinessDay(inputDate);

    expect(previous).toBe(trackedDate(36));
  });
});

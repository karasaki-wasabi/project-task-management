import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, afterEach, describe, expect, it } from "vitest";
import { db } from "../../shared/db.js";
import type { VerifiedWorkspaceId } from "../../shared/workspace-scope.js";
import { createUserData } from "../../test/user.fixture.js";
import { holidaysService } from "./holiday.service.js";

function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

const registeredIds: string[] = [];

async function hardDeleteTracked(): Promise<void> {
  if (registeredIds.length > 0) {
    await db.$executeRawUnsafe(
      `DELETE FROM non_business_days WHERE id IN (${registeredIds.map(() => "?").join(",")})`,
      ...registeredIds,
    );
  }
  registeredIds.length = 0;
}

async function hardDelete(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
}

function trackedDate(offsetDays: number): string {
  const base = new Date("2031-11-01T00:00:00.000Z");
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

async function registerTracked(
  input: { date: string; label?: string },
  workspaceId: VerifiedWorkspaceId,
  source: "manual" | "external_api" = "manual",
) {
  const holiday = await holidaysService.register({ ...input, workspaceId }, source);
  registeredIds.push(holiday.id);
  return holiday;
}

let workspaceA: VerifiedWorkspaceId;
let workspaceB: VerifiedWorkspaceId;
let userId: string;

beforeAll(async () => {
  const user = await db.user.create({ data: createUserData("holiday-svc-ws") });
  userId = user.id;
  const [a, b] = await Promise.all([
    db.workspace.create({ data: { name: `holiday-svc-a-${randomUUID()}`, createdByUserId: userId } }),
    db.workspace.create({ data: { name: `holiday-svc-b-${randomUUID()}`, createdByUserId: userId } }),
  ]);
  workspaceA = asVerified(a.id);
  workspaceB = asVerified(b.id);
});

afterEach(async () => {
  await hardDeleteTracked();
});

afterAll(async () => {
  await db.$executeRawUnsafe(
    `DELETE FROM non_business_days WHERE workspace_id IN (?, ?)`,
    workspaceA,
    workspaceB,
  );
  await hardDelete("workspaces", [workspaceA, workspaceB]);
  await hardDelete("users", [userId]);
  await db.$disconnect();
});

describe("holidaysService (task 6.1 + workspace-resource-scope 5.1)", () => {
  it("指定されたワークスペースに非営業日を登録 (Requirements 1.1, 8.1)", async () => {
    const date = trackedDate(1);

    const holiday = await registerTracked({ date, label: "文化の日" }, workspaceA);

    expect(holiday.date).toBe(date);
    expect(holiday.label).toBe("文化の日");
    expect(holiday.source).toBe("manual");
    expect(holiday.workspaceId).toBe(workspaceA);
  });

  it("無効な日付を受け取った場合、400 エラーを返す", async () => {
    await expect(
      holidaysService.register({ date: "not-a-date", workspaceId: workspaceA }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("同じ日付を2回登録した場合、409 エラーを返す", async () => {
    const date = trackedDate(2);
    await registerTracked({ date }, workspaceA);

    await expect(holidaysService.register({ date, workspaceId: workspaceA })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("別のワークスペースで同じ日付を登録できる (Requirement 1.2 unique per workspace)", async () => {
    const date = trackedDate(2);
    await registerTracked({ date }, workspaceA);

    const inB = await registerTracked({ date, label: "other ws" }, workspaceB);
    expect(inB.date).toBe(date);
    expect(inB.workspaceId).toBe(workspaceB);
  });

  it("元のレコードが削除された後に日付を再登録できる", async () => {
    const date = trackedDate(3);
    const first = await registerTracked({ date }, workspaceA);
    await holidaysService.remove(first.id, workspaceA);
    registeredIds.splice(registeredIds.indexOf(first.id), 1);

    const second = await registerTracked({ date, label: "re-registered" }, workspaceA);

    expect(second.date).toBe(date);
  });

  it("現在のワークスペースの非営業日のみを返す (Requirements 3.1, 9.4)", async () => {
    const kept = trackedDate(4);
    const removed = trackedDate(5);
    const foreign = trackedDate(6);
    const keptHoliday = await registerTracked({ date: kept }, workspaceA);
    const removedHoliday = await registerTracked({ date: removed }, workspaceA);
    const foreignHoliday = await registerTracked({ date: foreign }, workspaceB);
    await holidaysService.remove(removedHoliday.id, workspaceA);
    registeredIds.splice(registeredIds.indexOf(removedHoliday.id), 1);

    const list = await holidaysService.list(workspaceA);

    expect(list.some((h) => h.id === keptHoliday.id)).toBe(true);
    expect(list.some((h) => h.id === removedHoliday.id)).toBe(false);
    expect(list.some((h) => h.id === foreignHoliday.id)).toBe(false);
  });

  it("存在しない非営業日を削除した場合、404 エラーを返す", async () => {
    await expect(holidaysService.remove(randomUUID(), workspaceA)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("別のワークスペースの非営業日を削除した場合、404 エラーを返す (Requirement 3.3)", async () => {
    const holiday = await registerTracked({ date: trackedDate(8) }, workspaceB);

    await expect(holidaysService.remove(holiday.id, workspaceA)).rejects.toMatchObject({ statusCode: 404 });

    const stillThere = await holidaysService.list(workspaceB);
    expect(stillThere.some((h) => h.id === holiday.id)).toBe(true);
  });

  it("isBusinessDay は指定されたワークスペースでスコープされる", async () => {
    const holiday = trackedDate(9);
    const businessDay = trackedDate(10);
    await registerTracked({ date: holiday }, workspaceA);

    expect(await holidaysService.isBusinessDay(holiday, workspaceA)).toBe(false);
    expect(await holidaysService.isBusinessDay(holiday, workspaceB)).toBe(true);
    expect(await holidaysService.isBusinessDay(businessDay, workspaceA)).toBe(true);
  });

  it("nextBusinessDay でワークスペース内の1つの非営業日をスキップ", async () => {
    const holiday = trackedDate(10);
    await registerTracked({ date: holiday }, workspaceA);

    const inputDate = trackedDate(9);
    const next = await holidaysService.nextBusinessDay(inputDate, workspaceA);

    expect(next).toBe(trackedDate(11));
  });

  it("nextBusinessDay で連続する複数の非営業日をスキップし、非営業日が見つかるまで続ける", async () => {
    const inputDate = trackedDate(20);
    await registerTracked({ date: trackedDate(21) }, workspaceA);
    await registerTracked({ date: trackedDate(22) }, workspaceA);
    await registerTracked({ date: trackedDate(23) }, workspaceA);

    const next = await holidaysService.nextBusinessDay(inputDate, workspaceA);

    expect(next).toBe(trackedDate(24));
  });

  it("previousBusinessDay で連続する複数の非営業日をスキップし、非営業日が見つかるまで続ける", async () => {
    const inputDate = trackedDate(40);
    await registerTracked({ date: trackedDate(39) }, workspaceA);
    await registerTracked({ date: trackedDate(38) }, workspaceA);
    await registerTracked({ date: trackedDate(37) }, workspaceA);

    const previous = await holidaysService.previousBusinessDay(inputDate, workspaceA);

    expect(previous).toBe(trackedDate(36));
  });
});

describe("holidaysService.syncFromExternalApi 外部API同期 (task 6.2 + workspace-resource-scope 5.1)", () => {
  it("外部APIから新しい非営業日を現在のワークスペースに追加", async () => {
    const a = trackedDate(100);
    const b = trackedDate(101);
    const fakeFetch = async () => [
      { date: a, label: "holiday A" },
      { date: b, label: "holiday B" },
    ];

    const result = await holidaysService.syncFromExternalApi(workspaceA, fakeFetch);
    for (const h of result.added) registeredIds.push(h.id);

    expect(result.skippedExisting).toBe(0);
    expect(result.added.map((h) => h.date).sort()).toEqual([a, b].sort());
    expect(result.added.every((h) => h.source === "external_api")).toBe(true);
    expect(result.added.every((h) => h.workspaceId === workspaceA)).toBe(true);
  });

  it("同じワークスペース内に既に存在する日付をスキップし、新しいもののみを追加", async () => {
    const existing = trackedDate(110);
    const fresh = trackedDate(111);
    await registerTracked({ date: existing, label: "already there" }, workspaceA);
    const fakeFetch = async () => [
      { date: existing, label: "duplicate" },
      { date: fresh, label: "new one" },
    ];

    const result = await holidaysService.syncFromExternalApi(workspaceA, fakeFetch);
    for (const h of result.added) registeredIds.push(h.id);

    expect(result.skippedExisting).toBe(1);
    expect(result.added.map((h) => h.date)).toEqual([fresh]);
  });

  it("別のワークスペースにのみ存在する日付をスキップしない", async () => {
    const sharedDate = trackedDate(115);
    await registerTracked({ date: sharedDate, label: "in B" }, workspaceB);
    const fakeFetch = async () => [{ date: sharedDate, label: "for A" }];

    const result = await holidaysService.syncFromExternalApi(workspaceA, fakeFetch);
    for (const h of result.added) registeredIds.push(h.id);

    expect(result.skippedExisting).toBe(0);
    expect(result.added.map((h) => h.date)).toEqual([sharedDate]);
    expect(result.added[0]?.workspaceId).toBe(workspaceA);
  });

  it("外部APIが失敗した場合、502 エラーを返し、既存のマスターを変更しない", async () => {
    const existing = trackedDate(120);
    await registerTracked({ date: existing, label: "untouched" }, workspaceA);
    const failingFetch = async (): Promise<never> => {
      throw new Error("network down");
    };

    await expect(holidaysService.syncFromExternalApi(workspaceA, failingFetch)).rejects.toMatchObject({
      statusCode: 502,
    });

    const list = await holidaysService.list(workspaceA);
    expect(list.some((h) => h.date === existing)).toBe(true);
  });
});

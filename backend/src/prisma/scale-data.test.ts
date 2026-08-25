import { describe, expect, it } from "vitest";
import {
  SCALE_CREATE_MANY_CHUNK_SIZE,
  SCALE_DEFAULT_TASK_COUNT,
  SCALE_LOGIN_EMAIL,
  SCALE_LOGIN_PASSWORD,
  SCALE_MEMBER_ID,
  SCALE_STAGE_CANCELLED_ID,
  SCALE_STAGE_DONE_ID,
  SCALE_USER_ID,
  SCALE_WORKSPACE_ID,
} from "./scale-data.constants.js";
import {
  assignScheduledEndDates,
  chunkArray,
  parseScaleTaskCount,
  SCALE_SCHEDULED_END_DATE_RATIO,
} from "./scale-data.js";
import type {
  ScaleCleanupResult,
  ScaleSeedOptions,
  ScaleSeedResult,
} from "./scale-data.types.js";

/** デモ seed（seed-manual-data）の固定 ID。衝突検証用にハードコードし、当該モジュールは import しない。 */
const SEED_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "11111111-1111-4111-8111-111111111112",
  "11111111-1111-4111-8111-111111111113",
  "11111111-1111-4111-8111-111111111114",
  "11111111-1111-4111-8111-111111111115",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "33333333-3333-4333-8333-333333333334",
  "33333333-3333-4333-8333-333333333335",
  "33333333-3333-4333-8333-333333333336",
  "33333333-3333-4333-8333-333333333337",
  "44444444-4444-4444-8444-444444444401",
  "44444444-4444-4444-8444-444444444402",
  "44444444-4444-4444-8444-444444444403",
  "44444444-4444-4444-8444-444444444404",
] as const;

describe("scale-data.constants", () => {
  it("既定タスク件数は 6000、チャンクサイズは正の整数である", () => {
    expect(SCALE_DEFAULT_TASK_COUNT).toBe(6000);
    expect(SCALE_CREATE_MANY_CHUNK_SIZE).toBeGreaterThan(0);
    expect(Number.isInteger(SCALE_CREATE_MANY_CHUNK_SIZE)).toBe(true);
  });

  it("計測用メール／パスワードが定義され、デモ seed のログインと異なる", () => {
    expect(SCALE_LOGIN_EMAIL).toMatch(/@/);
    expect(SCALE_LOGIN_PASSWORD.length).toBeGreaterThan(0);
    expect(SCALE_LOGIN_EMAIL).not.toBe("root@example.com");
  });

  it("SCALE_* 固定 ID はデモ SEED_* と衝突せず、相互にも重複しない", () => {
    const scaleIds = [
      SCALE_USER_ID,
      SCALE_WORKSPACE_ID,
      SCALE_MEMBER_ID,
      SCALE_STAGE_DONE_ID,
      SCALE_STAGE_CANCELLED_ID,
    ];

    expect(new Set(scaleIds).size).toBe(scaleIds.length);

    for (const id of scaleIds) {
      expect(SEED_IDS).not.toContain(id);
    }
  });
});

describe("scale-data.types", () => {
  it("ScaleSeedOptions / ScaleSeedResult / ScaleCleanupResult の形を満たせる", () => {
    const options: ScaleSeedOptions = { taskCount: SCALE_DEFAULT_TASK_COUNT };
    const result: ScaleSeedResult = {
      workspaceId: SCALE_WORKSPACE_ID,
      userId: SCALE_USER_ID,
      userEmail: SCALE_LOGIN_EMAIL,
      taskCount: options.taskCount,
      scheduledEndDateCount: 0,
    };
    const cleanup: ScaleCleanupResult = {
      workspaceId: SCALE_WORKSPACE_ID,
      removed: true,
    };

    expect(result.workspaceId).toBe(SCALE_WORKSPACE_ID);
    expect(cleanup.removed).toBe(true);
  });
});

describe("parseScaleTaskCount", () => {
  it("未設定（undefined）のときは既定件数を返す", () => {
    expect(parseScaleTaskCount(undefined, SCALE_DEFAULT_TASK_COUNT)).toBe(
      SCALE_DEFAULT_TASK_COUNT,
    );
  });

  it("正の整数文字列はその件数にパースする", () => {
    expect(parseScaleTaskCount("6000", SCALE_DEFAULT_TASK_COUNT)).toBe(6000);
    expect(parseScaleTaskCount("50", SCALE_DEFAULT_TASK_COUNT)).toBe(50);
  });

  it("空文字・非整数・0以下は throw する", () => {
    expect(() => parseScaleTaskCount("", SCALE_DEFAULT_TASK_COUNT)).toThrow();
    expect(() => parseScaleTaskCount("  ", SCALE_DEFAULT_TASK_COUNT)).toThrow();
    expect(() => parseScaleTaskCount("abc", SCALE_DEFAULT_TASK_COUNT)).toThrow();
    expect(() => parseScaleTaskCount("1.5", SCALE_DEFAULT_TASK_COUNT)).toThrow();
    expect(() => parseScaleTaskCount("0", SCALE_DEFAULT_TASK_COUNT)).toThrow();
    expect(() => parseScaleTaskCount("-1", SCALE_DEFAULT_TASK_COUNT)).toThrow();
  });
});

describe("assignScheduledEndDates", () => {
  it("約 80% に終了予定日を付与し、残りは null にする", () => {
    const taskCount = 10;
    const dates = assignScheduledEndDates(taskCount);
    const withDate = dates.filter((d) => d !== null);

    expect(dates).toHaveLength(taskCount);
    expect(withDate).toHaveLength(
      Math.floor(taskCount * SCALE_SCHEDULED_END_DATE_RATIO),
    );
  });

  it("同じ件数なら同じ割当結果になる（再現可能）", () => {
    const a = assignScheduledEndDates(100);
    const b = assignScheduledEndDates(100);

    expect(a).toEqual(b);
    expect(a.filter((d) => d !== null)).toHaveLength(
      Math.floor(100 * SCALE_SCHEDULED_END_DATE_RATIO),
    );
  });

  it("付与された日付は分散している（単一日に集中しない）", () => {
    const dates = assignScheduledEndDates(100)
      .filter((d): d is Date => d !== null)
      .map((d) => d.toISOString().slice(0, 10));
    const uniqueDays = new Set(dates);

    expect(uniqueDays.size).toBeGreaterThan(1);
  });
});

describe("chunkArray", () => {
  it("件数がチャンクサイズ未満なら 1 チャンクに収める", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(chunkArray(items, SCALE_CREATE_MANY_CHUNK_SIZE)).toEqual([items]);
  });

  it("チャンク境界で分割する（余り付き）", () => {
    const items = Array.from({ length: 2500 }, (_, i) => i);
    const chunks = chunkArray(items, SCALE_CREATE_MANY_CHUNK_SIZE);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(SCALE_CREATE_MANY_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(SCALE_CREATE_MANY_CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(500);
    expect(chunks.flat()).toEqual(items);
  });

  it("ちょうどチャンクサイズの整数倍なら余りチャンクを作らない", () => {
    const items = Array.from(
      { length: SCALE_CREATE_MANY_CHUNK_SIZE * 2 },
      (_, i) => i,
    );
    const chunks = chunkArray(items, SCALE_CREATE_MANY_CHUNK_SIZE);

    expect(chunks).toHaveLength(2);
    expect(chunks.every((c) => c.length === SCALE_CREATE_MANY_CHUNK_SIZE)).toBe(
      true,
    );
  });

  it("空配列は空のチャンク一覧を返す", () => {
    expect(chunkArray([], SCALE_CREATE_MANY_CHUNK_SIZE)).toEqual([]);
  });
});

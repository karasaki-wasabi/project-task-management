import { describe, expect, it } from "vitest";
import type { NonBusinessDay } from "../../../../composables/useApiClient";
import {
  formatSyncResult,
  holidayDisplayLabel,
  holidaySourceBadge,
  sortHolidaysByDate,
} from "./index.helpers";

describe("休日ソースバッジ (task 7.2 / claude design)", () => {
  it("外部APIの場合、外部API情報バッジを表示", () => {
    expect(holidaySourceBadge("external_api")).toEqual({ tone: "info", label: "外部API" });
  });

  it("手動の場合、手動バッジを表示", () => {
    expect(holidaySourceBadge("manual")).toEqual({ tone: "neutral", label: "手動" });
  });
});

describe("同期結果の要約 (task 7.2, Requirement 9.3)", () => {
  it("新規追加とスキップのカウントを同じ形式で表示", () => {
    expect(formatSyncResult(2, 5)).toBe("新規追加: 2件 / スキップ: 5件");
  });
});

describe("祝日の日付順ソート", () => {
  it("日付順にソートし、入力を変更しない", () => {
    const input: NonBusinessDay[] = [
      { id: "2", date: "2026-09-21", label: "敬老の日", source: "external_api" },
      { id: "1", date: "2026-08-11", label: "山の日", source: "external_api" },
    ];
    const sorted = sortHolidaysByDate(input);
    expect(sorted.map((h) => h.id)).toEqual(["1", "2"]);
    expect(input.map((h) => h.id)).toEqual(["2", "1"]);
  });
});

describe("祝日ラベルの表示", () => {
  it("ラベルが空の場合、ダッシュを表示", () => {
    expect(holidayDisplayLabel(undefined)).toBe("—");
    expect(holidayDisplayLabel("")).toBe("—");
    expect(holidayDisplayLabel("  ")).toBe("—");
  });

  it("ラベルが存在する場合、ラベルを表示", () => {
    expect(holidayDisplayLabel("山の日")).toBe("山の日");
  });
});

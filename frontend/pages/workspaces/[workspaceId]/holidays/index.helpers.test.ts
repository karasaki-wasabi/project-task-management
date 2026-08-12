import { describe, expect, it } from "vitest";
import type { NonBusinessDay } from "../../../../composables/useApiClient";
import {
  formatSyncResult,
  holidayDisplayLabel,
  holidaySourceBadge,
  sortHolidaysByDate,
} from "./index.helpers";

describe("holidaySourceBadge (task 7.2 / claude design)", () => {
  it("maps external_api to 外部API info badge", () => {
    expect(holidaySourceBadge("external_api")).toEqual({ tone: "info", label: "外部API" });
  });

  it("maps manual to 手動 neutral badge", () => {
    expect(holidaySourceBadge("manual")).toEqual({ tone: "neutral", label: "手動" });
  });
});

describe("formatSyncResult (task 7.2, Requirement 9.3)", () => {
  it("formats added/skipped counts the same way as the previous recurrence page", () => {
    expect(formatSyncResult(2, 5)).toBe("新規追加: 2件 / スキップ: 5件");
  });
});

describe("sortHolidaysByDate", () => {
  it("returns holidays sorted ascending by date without mutating input", () => {
    const input: NonBusinessDay[] = [
      { id: "2", date: "2026-09-21", label: "敬老の日", source: "external_api" },
      { id: "1", date: "2026-08-11", label: "山の日", source: "external_api" },
    ];
    const sorted = sortHolidaysByDate(input);
    expect(sorted.map((h) => h.id)).toEqual(["1", "2"]);
    expect(input.map((h) => h.id)).toEqual(["2", "1"]);
  });
});

describe("holidayDisplayLabel", () => {
  it("falls back to an em dash when label is empty", () => {
    expect(holidayDisplayLabel(undefined)).toBe("—");
    expect(holidayDisplayLabel("")).toBe("—");
    expect(holidayDisplayLabel("  ")).toBe("—");
  });

  it("returns the label when present", () => {
    expect(holidayDisplayLabel("山の日")).toBe("山の日");
  });
});

import { describe, expect, it } from "vitest";
import { computeTodayIso, formatSlashDate, generateMonthGrid, parseLocalDateOnly, weekdayKanji } from "./DatePicker.helpers";

describe("computeTodayIso (task 11.1, Requirement 10.2)", () => {
  it("formats the reference date's local calendar day as YYYY-MM-DD", () => {
    const referenceDate = new Date(2026, 7, 5);
    expect(computeTodayIso(referenceDate)).toBe("2026-08-05");
  });

  it("ignores the time-of-day portion of the reference date", () => {
    const referenceDate = new Date(2026, 11, 31, 23, 59, 59);
    expect(computeTodayIso(referenceDate)).toBe("2026-12-31");
  });
});

describe("generateMonthGrid (task 11.1, Requirement 10.2)", () => {
  it("2026年8月の完全な日曜日から土曜日の週を生成し、正しいフラグを設定する", () => {
    const todayIso = "2026-08-05";
    const selectedIso = "2026-08-12";
    const grid = generateMonthGrid(2026, 8, todayIso, selectedIso);

    expect(grid.length % 7).toBe(0);
    expect(grid.length).toBe(42);

    expect(grid[0]).toEqual({
      date: "2026-07-26",
      inCurrentMonth: false,
      isToday: false,
      isSelected: false,
      dayOfWeek: 0,
    });

    const lastCell = grid[grid.length - 1];
    expect(lastCell).toEqual({
      date: "2026-09-05",
      inCurrentMonth: false,
      isToday: false,
      isSelected: false,
      dayOfWeek: 6,
    });

    const todayCell = grid.find((cell) => cell.date === todayIso);
    expect(todayCell).toEqual({
      date: "2026-08-05",
      inCurrentMonth: true,
      isToday: true,
      isSelected: false,
      dayOfWeek: 3,
    });

    const selectedCell = grid.find((cell) => cell.date === selectedIso);
    expect(selectedCell).toEqual({
      date: "2026-08-12",
      inCurrentMonth: true,
      isToday: false,
      isSelected: true,
      dayOfWeek: 3,
    });

    const firstOfMonthCell = grid.find((cell) => cell.date === "2026-08-01");
    expect(firstOfMonthCell?.inCurrentMonth).toBe(true);
    const lastOfMonthCell = grid.find((cell) => cell.date === "2026-08-31");
    expect(lastOfMonthCell?.inCurrentMonth).toBe(true);
  });

  it("selectedIso が空の場合、選択がないとみなす", () => {
    const grid = generateMonthGrid(2026, 8, "2026-08-05", "");
    expect(grid.every((cell) => !cell.isSelected)).toBe(true);
  });

  it("1日が日曜日である月で、先行日が不要な場合、処理を行う", () => {
    // 2026-11-01 is a Sunday.
    const grid = generateMonthGrid(2026, 11, "2026-08-05", "");
    expect(grid[0]?.date).toBe("2026-11-01");
    expect(grid[0]?.inCurrentMonth).toBe(true);
    expect(grid[0]?.dayOfWeek).toBe(0);
    expect(grid.length % 7).toBe(0);
  });

  it("dayOfWeek 0（日）と 6（土）を週末のセルに割り当ててスタイリングを行う", () => {
    const grid = generateMonthGrid(2026, 8, "2026-08-05", "");
    expect(grid.find((cell) => cell.date === "2026-08-01")?.dayOfWeek).toBe(6);
    expect(grid.find((cell) => cell.date === "2026-08-02")?.dayOfWeek).toBe(0);
  });
});

describe("formatSlashDate / weekdayKanji（デザインのずれを修正 — claude design mockup は YYYY/MM/DD + 曜日ラベルを使用）", () => {
  it("YYYY-MM-DD のワイヤー値を表示専用の YYYY/MM/DD に変換する", () => {
    expect(formatSlashDate("2026-09-14")).toBe("2026/09/14");
  });

  it("API の日時 ISO からも日付部分だけを YYYY/MM/DD に変換する", () => {
    expect(formatSlashDate("2026-08-10T00:00:00.000Z")).toBe("2026/08/10");
  });

  it("dayOfWeek のインデックスを漢字ラベルにマッピングする", () => {
    expect(weekdayKanji(0)).toBe("日");
    expect(weekdayKanji(1)).toBe("月");
    expect(weekdayKanji(6)).toBe("土");
  });
});

describe("parseLocalDateOnly", () => {
  it("YYYY-MM-DD をローカルカレンダーの日付として解析する", () => {
    const parsed = parseLocalDateOnly("2026-08-10");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(10);
  });

  it("API の日時 ISO は UTC 変換せず、日付部分だけを使用する", () => {
    const parsed = parseLocalDateOnly("2026-08-10T00:00:00.000Z");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(10);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });
});

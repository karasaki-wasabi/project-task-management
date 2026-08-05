import { describe, expect, it } from "vitest";
import { computeTodayIso, formatSlashDate, generateMonthGrid, weekdayKanji } from "./DatePicker.helpers";

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
  it("generates complete Sun-Sat weeks covering all of August 2026 with correct flags", () => {
    // August 2026: Aug 1 is a Saturday, Aug 31 is a Monday.
    // Leading day: Jul 26 (Sun). Trailing days: Sep 1-5 (Tue-Sat) to complete
    // the last week ending Saturday.
    const todayIso = "2026-08-05";
    const selectedIso = "2026-08-12";
    const grid = generateMonthGrid(2026, 8, todayIso, selectedIso);

    // 6 full weeks needed: Jul 26 - Aug 1, Aug 2-8, ..., Aug 30 - Sep 5.
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

  it("treats an empty selectedIso as no selection", () => {
    const grid = generateMonthGrid(2026, 8, "2026-08-05", "");
    expect(grid.every((cell) => !cell.isSelected)).toBe(true);
  });

  it("handles a month where the 1st falls on Sunday with no leading days needed", () => {
    // 2026-11-01 is a Sunday.
    const grid = generateMonthGrid(2026, 11, "2026-08-05", "");
    expect(grid[0]?.date).toBe("2026-11-01");
    expect(grid[0]?.inCurrentMonth).toBe(true);
    expect(grid[0]?.dayOfWeek).toBe(0);
    expect(grid.length % 7).toBe(0);
  });

  it("assigns dayOfWeek 0 (Sun) and 6 (Sat) to weekend cells for styling", () => {
    // 2026-08-01 is a Saturday, 2026-08-02 is a Sunday.
    const grid = generateMonthGrid(2026, 8, "2026-08-05", "");
    expect(grid.find((cell) => cell.date === "2026-08-01")?.dayOfWeek).toBe(6);
    expect(grid.find((cell) => cell.date === "2026-08-02")?.dayOfWeek).toBe(0);
  });
});

describe("formatSlashDate / weekdayKanji (design drift fix — claude design mockup uses YYYY/MM/DD + 曜日 labels)", () => {
  it("converts a YYYY-MM-DD wire value to display-only YYYY/MM/DD", () => {
    expect(formatSlashDate("2026-09-14")).toBe("2026/09/14");
  });

  it("maps dayOfWeek indices to the mockup's kanji labels", () => {
    expect(weekdayKanji(0)).toBe("日");
    expect(weekdayKanji(1)).toBe("月");
    expect(weekdayKanji(6)).toBe("土");
  });
});

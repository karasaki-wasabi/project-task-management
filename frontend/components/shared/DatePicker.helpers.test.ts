import { describe, expect, it } from "vitest";
import { computeQuickSelectDates, generateMonthGrid } from "./DatePicker.helpers";

describe("computeQuickSelectDates (task 11.1, Requirement 10.2)", () => {
  it("computes 今日/明日/1週間後/月末/来月1日 for a reference date mid-month", () => {
    // 2026-08-05 (火)
    const referenceDate = new Date(2026, 7, 5);
    expect(computeQuickSelectDates(referenceDate)).toEqual({
      today: "2026-08-05",
      tomorrow: "2026-08-06",
      oneWeekLater: "2026-08-12",
      endOfMonth: "2026-08-31",
      firstOfNextMonth: "2026-09-01",
    });
  });

  it("rolls 明日 over to the next month when the reference date is the last day of the month", () => {
    // 2026-08-31 is the last day of August.
    const referenceDate = new Date(2026, 7, 31);
    expect(computeQuickSelectDates(referenceDate)).toEqual({
      today: "2026-08-31",
      tomorrow: "2026-09-01",
      oneWeekLater: "2026-09-07",
      endOfMonth: "2026-08-31",
      firstOfNextMonth: "2026-09-01",
    });
  });

  it("rolls 来月1日 and 明日 over the year boundary when the reference date is in December", () => {
    // 2026-12-31 is the last day of the year.
    const referenceDate = new Date(2026, 11, 31);
    expect(computeQuickSelectDates(referenceDate)).toEqual({
      today: "2026-12-31",
      tomorrow: "2027-01-01",
      oneWeekLater: "2027-01-07",
      endOfMonth: "2026-12-31",
      firstOfNextMonth: "2027-01-01",
    });
  });

  it("computes 月末 correctly for February in a leap year", () => {
    // 2028 is a leap year: February has 29 days.
    const referenceDate = new Date(2028, 1, 10);
    const result = computeQuickSelectDates(referenceDate);
    expect(result.endOfMonth).toBe("2028-02-29");
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
    });

    const lastCell = grid[grid.length - 1];
    expect(lastCell).toEqual({
      date: "2026-09-05",
      inCurrentMonth: false,
      isToday: false,
      isSelected: false,
    });

    const todayCell = grid.find((cell) => cell.date === todayIso);
    expect(todayCell).toEqual({
      date: "2026-08-05",
      inCurrentMonth: true,
      isToday: true,
      isSelected: false,
    });

    const selectedCell = grid.find((cell) => cell.date === selectedIso);
    expect(selectedCell).toEqual({
      date: "2026-08-12",
      inCurrentMonth: true,
      isToday: false,
      isSelected: true,
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
    expect(grid.length % 7).toBe(0);
  });
});

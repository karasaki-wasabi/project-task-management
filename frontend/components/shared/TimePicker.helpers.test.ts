import { describe, expect, it } from "vitest";
import {
  computeNowHHmm,
  formatDisplay12,
  formatHHmm,
  parseHHmm,
  to12Hour,
  to24Hour,
  togglePeriod,
  wrapHour12,
  wrapMinute,
} from "./TimePicker.helpers";

describe("parseHHmm (task 12.1)", () => {
  it("parses a zero-padded HH:mm string", () => {
    expect(parseHHmm("09:05")).toEqual({ hour24: 9, minute: 5 });
  });

  it("parses a non-zero-padded HH:mm string", () => {
    expect(parseHHmm("9:5")).toEqual({ hour24: 9, minute: 5 });
  });

  it("returns null for the empty (unset) string", () => {
    expect(parseHHmm("")).toBeNull();
  });

  it("returns null for an out-of-range hour or minute", () => {
    expect(parseHHmm("24:00")).toBeNull();
    expect(parseHHmm("10:60")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseHHmm("not-a-time")).toBeNull();
  });
});

describe("formatHHmm", () => {
  it("zero-pads single-digit hour and minute", () => {
    expect(formatHHmm(9, 5)).toBe("09:05");
  });

  it("round-trips through parseHHmm", () => {
    expect(parseHHmm(formatHHmm(23, 59))).toEqual({ hour24: 23, minute: 59 });
  });
});

describe("to12Hour / to24Hour (12h<->24h boundary conversion)", () => {
  it("converts midnight (0:00) to 12 AM", () => {
    expect(to12Hour(0, 0)).toEqual({ hour12: 12, minute: 0, period: "AM" });
  });

  it("converts noon (12:00) to 12 PM", () => {
    expect(to12Hour(12, 30)).toEqual({ hour12: 12, minute: 30, period: "PM" });
  });

  it("converts an afternoon hour (e.g. 15:00) to 3 PM", () => {
    expect(to12Hour(15, 0)).toEqual({ hour12: 3, minute: 0, period: "PM" });
  });

  it("converts a morning hour (e.g. 9:00) to 9 AM", () => {
    expect(to12Hour(9, 0)).toEqual({ hour12: 9, minute: 0, period: "AM" });
  });

  it("is the inverse of to24Hour across the full 24-hour range", () => {
    for (let hour24 = 0; hour24 < 24; hour24 += 1) {
      const { hour12, minute, period } = to12Hour(hour24, 15);
      expect(to24Hour(hour12, minute, period)).toEqual({ hour24, minute: 15 });
    }
  });

  it("converts 12 AM and 12 PM back to 24-hour 0 and 12", () => {
    expect(to24Hour(12, 0, "AM")).toEqual({ hour24: 0, minute: 0 });
    expect(to24Hour(12, 0, "PM")).toEqual({ hour24: 12, minute: 0 });
  });
});

describe("formatDisplay12", () => {
  it("formats a morning time", () => {
    expect(formatDisplay12(10, 0)).toBe("10:00 AM");
  });

  it("formats an afternoon time with zero-padded minutes", () => {
    expect(formatDisplay12(14, 5)).toBe("2:05 PM");
  });

  it("formats midnight as 12 AM", () => {
    expect(formatDisplay12(0, 0)).toBe("12:00 AM");
  });
});

describe("computeNowHHmm", () => {
  it("formats an injected reference Date's local hour/minute", () => {
    const now = new Date(2026, 7, 5, 9, 5);
    expect(computeNowHHmm(now)).toBe("09:05");
  });
});

describe("wrapHour12 (circular 1-12 hour wheel)", () => {
  it("steps forward within range without wrapping", () => {
    expect(wrapHour12(5, 1)).toBe(6);
  });

  it("wraps from 12 forward to 1", () => {
    expect(wrapHour12(12, 1)).toBe(1);
  });

  it("wraps from 1 backward to 12", () => {
    expect(wrapHour12(1, -1)).toBe(12);
  });

  it("wraps forward across a full revolution", () => {
    expect(wrapHour12(6, 12)).toBe(6);
  });
});

describe("wrapMinute (circular 0-59 minute wheel)", () => {
  it("steps forward within range without wrapping", () => {
    expect(wrapMinute(10, 1)).toBe(11);
  });

  it("wraps from 59 forward to 0", () => {
    expect(wrapMinute(59, 1)).toBe(0);
  });

  it("wraps from 0 backward to 59", () => {
    expect(wrapMinute(0, -1)).toBe(59);
  });

  it("wraps forward across a full revolution", () => {
    expect(wrapMinute(30, 60)).toBe(30);
  });
});

describe("togglePeriod", () => {
  it("toggles AM to PM and back", () => {
    expect(togglePeriod("AM")).toBe("PM");
    expect(togglePeriod("PM")).toBe("AM");
  });
});

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

describe("parseHHmm", () => {
  it("0埋めされたHH:mm 文字列を解析する", () => {
    expect(parseHHmm("09:05")).toEqual({ hour24: 9, minute: 5 });
  });

  it("0埋めされていないHH:mm 文字列を解析する", () => {
    expect(parseHHmm("9:5")).toEqual({ hour24: 9, minute: 5 });
  });

  it("空文字列（未設定）をnull にする", () => {
    expect(parseHHmm("")).toBeNull();
  });

  it("範囲外の時刻をnull にする", () => {
    expect(parseHHmm("24:00")).toBeNull();
    expect(parseHHmm("10:60")).toBeNull();
  });

  it("不正な入力をnull にする", () => {
    expect(parseHHmm("not-a-time")).toBeNull();
  });
});

describe("formatHHmm", () => {
  it("1桁の時刻を0埋めする", () => {
    expect(formatHHmm(9, 5)).toBe("09:05");
  });

  it("parseHHmm で往復する", () => {
    expect(parseHHmm(formatHHmm(23, 59))).toEqual({ hour24: 23, minute: 59 });
  });
});

describe("to12Hour / to24Hour", () => {
  it("深夜（0:00）を12 AM に変換する", () => {
    expect(to12Hour(0, 0)).toEqual({ hour12: 12, minute: 0, period: "AM" });
  });

  it("正午（12:00）を12 PM に変換する", () => {
    expect(to12Hour(12, 30)).toEqual({ hour12: 12, minute: 30, period: "PM" });
  });

  it("午後の時刻（例: 15:00）を3 PM に変換する", () => {
    expect(to12Hour(15, 0)).toEqual({ hour12: 3, minute: 0, period: "PM" });
  });

  it("午前の時刻（例: 9:00）を9 AM に変換する", () => {
    expect(to12Hour(9, 0)).toEqual({ hour12: 9, minute: 0, period: "AM" });
  });

  it("to24Hour で全24時間範囲を往復する", () => {
    for (let hour24 = 0; hour24 < 24; hour24 += 1) {
      const { hour12, minute, period } = to12Hour(hour24, 15);
      expect(to24Hour(hour12, minute, period)).toEqual({ hour24, minute: 15 });
    }
  });

  it("12 AM と12 PM を24時間制の0 と12 に変換する", () => {
    expect(to24Hour(12, 0, "AM")).toEqual({ hour24: 0, minute: 0 });
    expect(to24Hour(12, 0, "PM")).toEqual({ hour24: 12, minute: 0 });
  });
});

describe("formatDisplay12", () => {
  it("午前の時刻をフォーマットする", () => {
    expect(formatDisplay12(10, 0)).toBe("10:00 AM");
  });

  it("午後の時刻を0埋めされた分でフォーマットする", () => {
    expect(formatDisplay12(14, 5)).toBe("2:05 PM");
  });

  it("深夜を12 AM でフォーマットする", () => {
    expect(formatDisplay12(0, 0)).toBe("12:00 AM");
  });
});

describe("computeNowHHmm", () => {
  it("注入された参照日のローカル時刻/分をフォーマットする", () => {
    const now = new Date(2026, 7, 5, 9, 5);
    expect(computeNowHHmm(now)).toBe("09:05");
  });
});

describe("wrapHour12", () => {
  it("範囲内で前進し、ラップしない", () => {
    expect(wrapHour12(5, 1)).toBe(6);
  });

  it("12 から1 にラップする", () => {
    expect(wrapHour12(12, 1)).toBe(1);
  });

  it("1 から 12 にラップする", () => {
    expect(wrapHour12(1, -1)).toBe(12);
  });

  it("全回転をまたいで前進する", () => {
    expect(wrapHour12(6, 12)).toBe(6);
  });
});

describe("wrapMinute", () => {
  it("範囲内で前進し、ラップしない", () => {
    expect(wrapMinute(10, 1)).toBe(11);
  });

  it("59 から0 にラップする", () => {
    expect(wrapMinute(59, 1)).toBe(0);
  });

  it("0 から59 にラップする", () => {
    expect(wrapMinute(0, -1)).toBe(59);
  });

  it("全回転をまたいで前進する", () => {
    expect(wrapMinute(30, 60)).toBe(30);
  });
});

describe("togglePeriod", () => {
  it("AM とPM を切り替える", () => {
    expect(togglePeriod("AM")).toBe("PM");
    expect(togglePeriod("PM")).toBe("AM");
  });
});

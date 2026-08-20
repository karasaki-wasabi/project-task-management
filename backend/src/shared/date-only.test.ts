import { describe, expect, it } from "vitest";
import { formatDateOnly, parseDateOnly } from "./date-only.js";

describe("parseDateOnly", () => {
  it("YYYY-MM-DD を UTC の 0 時にパースする", () => {
    const date = parseDateOnly("2024-03-15");

    expect(date.toISOString()).toBe("2024-03-15T00:00:00.000Z");
  });

  it("ローカルタイムゾーンのパースでカレンダー日をシフトしない", () => {
    const date = parseDateOnly("2024-01-01");

    expect(date.getUTCFullYear()).toBe(2024);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(1);
    expect(date.getUTCHours()).toBe(0);
  });
});

describe("formatDateOnly", () => {
  it("UTC Date を YYYY-MM-DD にフォーマットする", () => {
    expect(formatDateOnly(new Date("2024-03-15T00:00:00.000Z"))).toBe("2024-03-15");
  });

  it("ISO 文字列の UTC カレンダー日を使用する", () => {
    expect(formatDateOnly(new Date("2024-12-31T12:30:00.000Z"))).toBe("2024-12-31");
  });
});

describe("parseDateOnly / formatDateOnly round-trip", () => {
  it("YYYY-MM-DD 文字列を round-trip する", () => {
    const input = "2025-06-01";

    expect(formatDateOnly(parseDateOnly(input))).toBe(input);
  });
});

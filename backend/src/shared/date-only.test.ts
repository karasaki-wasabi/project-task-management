import { describe, expect, it } from "vitest";
import { formatDateOnly, parseDateOnly } from "./date-only.js";

describe("parseDateOnly", () => {
  it("parses YYYY-MM-DD as UTC midnight", () => {
    const date = parseDateOnly("2024-03-15");

    expect(date.toISOString()).toBe("2024-03-15T00:00:00.000Z");
  });

  it("does not shift the calendar day under local timezone parsing", () => {
    const date = parseDateOnly("2024-01-01");

    expect(date.getUTCFullYear()).toBe(2024);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(1);
    expect(date.getUTCHours()).toBe(0);
  });
});

describe("formatDateOnly", () => {
  it("formats a UTC Date as YYYY-MM-DD", () => {
    expect(formatDateOnly(new Date("2024-03-15T00:00:00.000Z"))).toBe("2024-03-15");
  });

  it("uses the UTC calendar day from the ISO string", () => {
    expect(formatDateOnly(new Date("2024-12-31T12:30:00.000Z"))).toBe("2024-12-31");
  });
});

describe("parseDateOnly / formatDateOnly round-trip", () => {
  it("round-trips YYYY-MM-DD strings", () => {
    const input = "2025-06-01";

    expect(formatDateOnly(parseDateOnly(input))).toBe(input);
  });
});

import { describe, expect, it } from "vitest";
import { combineDateTime, splitDateTime } from "./DateTimePicker.helpers";

describe("combineDateTime (task 12.2)", () => {
  it("joins a date-only ISO string and an HH:mm string with a T separator", () => {
    expect(combineDateTime("2026-09-14", "13:30")).toBe("2026-09-14T13:30");
  });

  it("returns the empty string when the date part is unset", () => {
    expect(combineDateTime("", "13:30")).toBe("");
  });

  it("returns the empty string when the time part is unset", () => {
    expect(combineDateTime("2026-09-14", "")).toBe("");
  });

  it("returns the empty string when both parts are unset", () => {
    expect(combineDateTime("", "")).toBe("");
  });
});

describe("splitDateTime (task 12.2)", () => {
  it("splits a combined ISO datetime string into date-only and HH:mm parts", () => {
    expect(splitDateTime("2026-09-14T13:30")).toEqual({ dateOnly: "2026-09-14", hhmm: "13:30" });
  });

  it("splits the empty (unset) string into two empty parts", () => {
    expect(splitDateTime("")).toEqual({ dateOnly: "", hhmm: "" });
  });

  it("treats a date-only string with no T separator as having no time part", () => {
    expect(splitDateTime("2026-09-14")).toEqual({ dateOnly: "2026-09-14", hhmm: "" });
  });

  it("round-trips through combineDateTime for a fully-set value", () => {
    const original = "2026-01-02T09:05";
    const { dateOnly, hhmm } = splitDateTime(original);
    expect(combineDateTime(dateOnly, hhmm)).toBe(original);
  });
});

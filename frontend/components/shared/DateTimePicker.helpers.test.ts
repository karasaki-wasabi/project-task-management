import { describe, expect, it } from "vitest";
import { combineDateTime, splitDateTime } from "./DateTimePicker.helpers";

describe("combineDateTime (task 12.2)", () => {
  it("dateOnly ISO 文字列と HH:mm 文字列を T 区切りで結合する", () => {
    expect(combineDateTime("2026-09-14", "13:30")).toBe("2026-09-14T13:30");
  });

  it("dateOnly が未設定の場合、空文字列を返す", () => {
    expect(combineDateTime("", "13:30")).toBe("");
  });

  it("hhmm が未設定の場合、空文字列を返す", () => {
    expect(combineDateTime("2026-09-14", "")).toBe("");
  });

  it("dateOnly と hhmm が未設定の場合、空文字列を返す", () => {
    expect(combineDateTime("", "")).toBe("");
  });
});

describe("splitDateTime (task 12.2)", () => {
  it("結合された ISO 日時文字列を dateOnly と hhmm に分割する", () => {
    expect(splitDateTime("2026-09-14T13:30")).toEqual({ dateOnly: "2026-09-14", hhmm: "13:30" });
  });

  it("空文字列（未設定）を2つの空文字列に分割する", () => {
    expect(splitDateTime("")).toEqual({ dateOnly: "", hhmm: "" });
  });

  it("T 区切りがない dateOnly 文字列を時刻部分がないものとして扱う", () => {
    expect(splitDateTime("2026-09-14")).toEqual({ dateOnly: "2026-09-14", hhmm: "" });
  });

  it("完全に設定された値を combineDateTime で往復する", () => {
    const original = "2026-01-02T09:05";
    const { dateOnly, hhmm } = splitDateTime(original);
    expect(combineDateTime(dateOnly, hhmm)).toBe(original);
  });
});

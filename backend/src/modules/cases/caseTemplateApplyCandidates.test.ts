import { describe, expect, it } from "vitest";
import {
  buildCaseTemplateApplyCandidates,
  type CaseTemplateApplyOperation,
} from "./caseTemplateApplyCandidates.js";

function keys(
  oldStart: string | null,
  oldEnd: string | null,
  newStart: string | null,
  newEnd: string | null,
): CaseTemplateApplyOperation[] {
  return buildCaseTemplateApplyCandidates(oldStart, oldEnd, newStart, newEnd);
}

describe("buildCaseTemplateApplyCandidates (task 3.1)", () => {
  describe("start transitions (Requirements 4.5–4.7)", () => {
    it("proposes start_generate when start goes null → value", () => {
      expect(keys(null, null, "2026-04-01", null)).toEqual(["start_generate"]);
    });

    it("proposes start_regenerate when start value → other value", () => {
      expect(keys("2026-04-01", null, "2026-04-15", null)).toEqual([
        "start_regenerate",
      ]);
    });

    it("proposes start_delete when start value → null", () => {
      expect(keys("2026-04-01", null, null, null)).toEqual(["start_delete"]);
    });
  });

  describe("end transitions (Requirement 4.8)", () => {
    it("proposes end_generate when end goes null → value", () => {
      expect(keys(null, null, null, "2026-05-31")).toEqual(["end_generate"]);
    });

    it("proposes end_regenerate when end value → other value", () => {
      expect(keys(null, "2026-05-31", null, "2026-06-30")).toEqual([
        "end_regenerate",
      ]);
    });

    it("proposes end_delete when end value → null", () => {
      expect(keys(null, "2026-05-31", null, null)).toEqual(["end_delete"]);
    });
  });

  describe("month transitions (Requirements 4.9–4.11)", () => {
    it("proposes month_generate when both dates become set (create)", () => {
      expect(keys(null, null, "2026-04-01", "2026-05-31")).toEqual([
        "start_generate",
        "end_generate",
        "month_generate",
      ]);
    });

    it("proposes month_generate when the missing date is filled so both become set", () => {
      expect(keys("2026-04-01", null, "2026-04-01", "2026-05-31")).toEqual([
        "end_generate",
        "month_generate",
      ]);
      expect(keys(null, "2026-05-31", "2026-04-01", "2026-05-31")).toEqual([
        "start_generate",
        "month_generate",
      ]);
    });

    it("proposes month_regenerate when both stay set and at least one date changes", () => {
      expect(keys("2026-04-01", "2026-05-31", "2026-04-15", "2026-05-31")).toEqual([
        "start_regenerate",
        "month_regenerate",
      ]);
      expect(keys("2026-04-01", "2026-05-31", "2026-04-01", "2026-06-30")).toEqual([
        "end_regenerate",
        "month_regenerate",
      ]);
      expect(keys("2026-04-01", "2026-05-31", "2026-04-15", "2026-06-30")).toEqual([
        "start_regenerate",
        "end_regenerate",
        "month_regenerate",
      ]);
    });

    it("proposes month_delete when both were set and one or both become unset", () => {
      expect(keys("2026-04-01", "2026-05-31", null, "2026-05-31")).toEqual([
        "start_delete",
        "month_delete",
      ]);
      expect(keys("2026-04-01", "2026-05-31", "2026-04-01", null)).toEqual([
        "end_delete",
        "month_delete",
      ]);
      expect(keys("2026-04-01", "2026-05-31", null, null)).toEqual([
        "start_delete",
        "end_delete",
        "month_delete",
      ]);
    });
  });

  describe("zero-candidate transitions (Requirement 4.12)", () => {
    it("returns [] when create has no dates", () => {
      expect(keys(null, null, null, null)).toEqual([]);
    });

    it("returns [] when dates are unchanged (both set)", () => {
      expect(keys("2026-04-01", "2026-05-31", "2026-04-01", "2026-05-31")).toEqual(
        [],
      );
    });

    it("returns [] when dates are unchanged (only start)", () => {
      expect(keys("2026-04-01", null, "2026-04-01", null)).toEqual([]);
    });

    it("returns [] when dates are unchanged (only end)", () => {
      expect(keys(null, "2026-05-31", null, "2026-05-31")).toEqual([]);
    });
  });

  describe("Date input normalization", () => {
    it("treats equivalent Date and YYYY-MM-DD string as the same calendar day", () => {
      expect(
        buildCaseTemplateApplyCandidates(
          new Date("2026-04-01T00:00:00.000Z"),
          new Date("2026-05-31T00:00:00.000Z"),
          "2026-04-01",
          "2026-05-31",
        ),
      ).toEqual([]);
    });

    it("treats undefined like null", () => {
      expect(
        buildCaseTemplateApplyCandidates(undefined, undefined, "2026-04-01", undefined),
      ).toEqual(["start_generate"]);
    });
  });
});

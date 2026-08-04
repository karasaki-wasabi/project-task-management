import { describe, expect, it } from "vitest";
import { buildUpdateCaseInput, validateCaseEditForm } from "./CaseDetailModal.helpers";

describe("validateCaseEditForm (Requirement 5.3)", () => {
  it("accepts a valid edit form", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "2026-01-01", endDate: "2026-01-31" })).toEqual({
      valid: true,
    });
  });

  it("accepts an empty startDate (nullable field)", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "", endDate: "2026-01-31" })).toEqual({ valid: true });
  });

  it("rejects an empty name", () => {
    const result = validateCaseEditForm({ name: "  ", startDate: "", endDate: "2026-01-31" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects an empty endDate", () => {
    const result = validateCaseEditForm({ name: "案件A", startDate: "", endDate: "" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects startDate after endDate", () => {
    const result = validateCaseEditForm({ name: "案件A", startDate: "2026-02-01", endDate: "2026-01-31" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("accepts startDate exactly equal to endDate (boundary)", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "2026-01-31", endDate: "2026-01-31" })).toEqual({
      valid: true,
    });
  });
});

describe("buildUpdateCaseInput (Requirement 5.2/5.4)", () => {
  it("trims the name and passes endDate/isCompleted through", () => {
    expect(
      buildUpdateCaseInput({ name: "  案件A  ", startDate: "2026-01-01", endDate: "2026-01-31", isCompleted: true }),
    ).toEqual({
      name: "案件A",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      isCompleted: true,
    });
  });

  it("maps an empty startDate to null rather than omitting or empty string", () => {
    expect(buildUpdateCaseInput({ name: "案件A", startDate: "", endDate: "2026-01-31", isCompleted: false })).toEqual({
      name: "案件A",
      startDate: null,
      endDate: "2026-01-31",
      isCompleted: false,
    });
  });

  it("keeps isCompleted independent of any date fields (Requirement 5.4)", () => {
    const withCompletion = buildUpdateCaseInput({
      name: "案件A",
      startDate: "",
      endDate: "2020-01-01", // far in the past — would be overdue if incomplete
      isCompleted: true,
    });
    expect(withCompletion.isCompleted).toBe(true);
    expect(withCompletion.endDate).toBe("2020-01-01");
  });
});

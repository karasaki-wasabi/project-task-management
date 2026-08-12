import { describe, expect, it } from "vitest";
import type { CaseProgress, DevelopmentStage, Task } from "../../composables/useApiClient";
import {
  buildUpdateCaseInput,
  requiredTaskCompletionMark,
  resolveEditApplyCandidates,
  shouldShowRequiredProgress,
  validateCaseEditForm,
} from "./CaseDetailModal.helpers";

function makeStage(overrides: Partial<DevelopmentStage> & { id: string }): DevelopmentStage {
  return {
    name: overrides.id,
    order: 0,
    kind: "normal",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    status: "not_started",
    priority: "medium",
    isRequiredForCase: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

const stages: DevelopmentStage[] = [
  makeStage({ id: "s-normal", kind: "normal" }),
  makeStage({ id: "s-done", kind: "completed", name: "完了" }),
  makeStage({ id: "s-cancel", kind: "cancelled", name: "中止" }),
];

describe("shouldShowRequiredProgress (task-status-model 5.6, Requirement 6.6)", () => {
  it("returns false when progress is missing", () => {
    expect(shouldShowRequiredProgress(null)).toBe(false);
    expect(shouldShowRequiredProgress(undefined)).toBe(false);
  });

  it("returns false when requiredTotal is 0", () => {
    const progress: CaseProgress = {
      requiredTotal: 0,
      requiredCompleted: 0,
      requiredIncomplete: 0,
      isOverdueWithIncomplete: false,
    };
    expect(shouldShowRequiredProgress(progress)).toBe(false);
  });

  it("returns true when requiredTotal is positive", () => {
    const progress: CaseProgress = {
      requiredTotal: 4,
      requiredCompleted: 1,
      requiredIncomplete: 3,
      isOverdueWithIncomplete: false,
    };
    expect(shouldShowRequiredProgress(progress)).toBe(true);
  });
});

describe("requiredTaskCompletionMark (task-status-model 5.6, Requirement 8.3)", () => {
  it("marks completed-stage tasks as completed (not status-based)", () => {
    expect(
      requiredTaskCompletionMark(
        makeTask({ id: "t1", developmentStageId: "s-done", status: "not_started" }),
        stages,
      ),
    ).toBe("completed");
  });

  it("marks cancelled-stage tasks as cancelled so they are not left incomplete", () => {
    expect(
      requiredTaskCompletionMark(
        makeTask({ id: "t2", developmentStageId: "s-cancel", status: "in_progress" }),
        stages,
      ),
    ).toBe("cancelled");
  });

  it("marks open-stage tasks as incomplete even if status is ready_for_handoff", () => {
    expect(
      requiredTaskCompletionMark(
        makeTask({ id: "t3", developmentStageId: "s-normal", status: "ready_for_handoff" }),
        stages,
      ),
    ).toBe("incomplete");
  });
});


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

  it("accepts an empty endDate (nullable field)", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "", endDate: "" })).toEqual({ valid: true });
    expect(validateCaseEditForm({ name: "案件A", startDate: "2026-01-01", endDate: "" })).toEqual({ valid: true });
  });

  it("accepts both startDate and endDate empty", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "", endDate: "" })).toEqual({ valid: true });
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

  it("maps an empty endDate to null rather than omitting or empty string", () => {
    expect(buildUpdateCaseInput({ name: "案件A", startDate: "2026-01-01", endDate: "", isCompleted: false })).toEqual({
      name: "案件A",
      startDate: "2026-01-01",
      endDate: null,
      isCompleted: false,
    });
  });

  it("maps both empty startDate and endDate to null", () => {
    expect(buildUpdateCaseInput({ name: "案件A", startDate: "", endDate: "", isCompleted: false })).toEqual({
      name: "案件A",
      startDate: null,
      endDate: null,
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

  it("omits templateOperations when options are not provided (Req 4.12 path)", () => {
    const body = buildUpdateCaseInput({
      name: "案件A",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      isCompleted: false,
    });
    expect(body).not.toHaveProperty("templateOperations");
  });

  it("includes templateOperations when provided, including empty array (Req 4.13)", () => {
    expect(
      buildUpdateCaseInput(
        { name: "案件A", startDate: "2026-01-01", endDate: "2026-01-31", isCompleted: false },
        { templateOperations: [] },
      ),
    ).toEqual({
      name: "案件A",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      isCompleted: false,
      templateOperations: [],
    });

    expect(
      buildUpdateCaseInput(
        { name: "案件A", startDate: "2026-02-01", endDate: "2026-01-31", isCompleted: false },
        { templateOperations: ["start_regenerate", "month_regenerate"] },
      ).templateOperations,
    ).toEqual(["start_regenerate", "month_regenerate"]);
  });
});

describe("resolveEditApplyCandidates (Requirements 4.5–4.12)", () => {
  it("returns empty when dates are unchanged (Req 4.12)", () => {
    expect(
      resolveEditApplyCandidates("2026-08-01", "2026-08-10", "2026-08-01", "2026-08-10"),
    ).toEqual([]);
  });

  it("maps start change to start_regenerate + month_regenerate (Req 4.6, 4.10)", () => {
    expect(
      resolveEditApplyCandidates("2026-08-01", "2026-08-10", "2026-09-01", "2026-08-10"),
    ).toEqual(["start_regenerate", "month_regenerate"]);
  });

  it("maps null→both dates to start_generate, end_generate, month_generate (Req 4.5, 4.8, 4.9)", () => {
    expect(resolveEditApplyCandidates(null, null, "2026-08-01", "2026-08-10")).toEqual([
      "start_generate",
      "end_generate",
      "month_generate",
    ]);
  });

  it("treats empty new date strings as unset (Req 4.7, 4.11)", () => {
    expect(resolveEditApplyCandidates("2026-08-01", "2026-08-10", "", "")).toEqual([
      "start_delete",
      "end_delete",
      "month_delete",
    ]);
  });
});

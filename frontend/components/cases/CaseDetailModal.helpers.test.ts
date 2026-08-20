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
  it("進行状況がない場合、false を返す", () => {
    expect(shouldShowRequiredProgress(null)).toBe(false);
    expect(shouldShowRequiredProgress(undefined)).toBe(false);
  });

  it("必要なタスクが0の場合、false を返す", () => {
    const progress: CaseProgress = {
      requiredTotal: 0,
      requiredCompleted: 0,
      requiredIncomplete: 0,
      isOverdueWithIncomplete: false,
    };
    expect(shouldShowRequiredProgress(progress)).toBe(false);
  });

  it("必要なタスクが1以上の場合、true を返す", () => {
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
  it("完了ステージのタスクは、完了としてマークされる（ステータスに基づかない）", () => {
    expect(
      requiredTaskCompletionMark(
        makeTask({ id: "t1", developmentStageId: "s-done", status: "not_started" }),
        stages,
      ),
    ).toBe("completed");
  });

  it("中止ステージのタスクは、中止としてマークされるので、不完全なタスクが残らない", () => {
    expect(
      requiredTaskCompletionMark(
        makeTask({ id: "t2", developmentStageId: "s-cancel", status: "in_progress" }),
        stages,
      ),
    ).toBe("cancelled");
  });

  it("開始ステージのタスクは、ステータスが ready_for_handoff であっても、不完全としてマークされる", () => {
    expect(
      requiredTaskCompletionMark(
        makeTask({ id: "t3", developmentStageId: "s-normal", status: "ready_for_handoff" }),
        stages,
      ),
    ).toBe("incomplete");
  });
});


describe("validateCaseEditForm (Requirement 5.3)", () => {
  it("有効な編集フォームを受け入れる", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "2026-01-01", endDate: "2026-01-31" })).toEqual({
      valid: true,
    });
  });

  it("開始日が空の場合、受け入れる（nullable フィールド）", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "", endDate: "2026-01-31" })).toEqual({ valid: true });
  });

  it("名前が空の場合、拒否する", () => {
    const result = validateCaseEditForm({ name: "  ", startDate: "", endDate: "2026-01-31" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("終了日が空の場合、受け入れる（nullable フィールド）", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "", endDate: "" })).toEqual({ valid: true });
    expect(validateCaseEditForm({ name: "案件A", startDate: "2026-01-01", endDate: "" })).toEqual({ valid: true });
  });

  it("開始日と終了日が空の場合、受け入れる", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "", endDate: "" })).toEqual({ valid: true });
  });

  it("開始日が終了日より後の場合、拒否する", () => {
    const result = validateCaseEditForm({ name: "案件A", startDate: "2026-02-01", endDate: "2026-01-31" });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("開始日が終了日と完全に一致する場合、受け入れる（境界値）", () => {
    expect(validateCaseEditForm({ name: "案件A", startDate: "2026-01-31", endDate: "2026-01-31" })).toEqual({
      valid: true,
    });
  });
});

describe("buildUpdateCaseInput (Requirement 5.2/5.4)", () => {
  it("名前をトリムし、endDate/isCompleted を渡す", () => {
    expect(
      buildUpdateCaseInput({ name: "  案件A  ", startDate: "2026-01-01", endDate: "2026-01-31", isCompleted: true }),
    ).toEqual({
      name: "案件A",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      isCompleted: true,
    });
  });

  it("空の開始日を null にマッピングし、空の文字列を省略しない", () => {
    expect(buildUpdateCaseInput({ name: "案件A", startDate: "", endDate: "2026-01-31", isCompleted: false })).toEqual({
      name: "案件A",
      startDate: null,
      endDate: "2026-01-31",
      isCompleted: false,
    });
  });

  it("空の終了日を null にマッピングし、空の文字列を省略しない", () => {
    expect(buildUpdateCaseInput({ name: "案件A", startDate: "2026-01-01", endDate: "", isCompleted: false })).toEqual({
      name: "案件A",
      startDate: "2026-01-01",
      endDate: null,
      isCompleted: false,
    });
  });

  it("空の開始日と終了日を null にマッピングする", () => {
    expect(buildUpdateCaseInput({ name: "案件A", startDate: "", endDate: "", isCompleted: false })).toEqual({
      name: "案件A",
      startDate: null,
      endDate: null,
      isCompleted: false,
    });
  });

  it("isCompleted は、日付フィールドに関係なく独立して保持される（Requirement 5.4）", () => {
    const withCompletion = buildUpdateCaseInput({
      name: "案件A",
      startDate: "",
      endDate: "2020-01-01", // 過去の日付 — 不完全な場合は遅れている
      isCompleted: true,
    });
    expect(withCompletion.isCompleted).toBe(true);
    expect(withCompletion.endDate).toBe("2020-01-01");
  });

  it("オプションが提供されていない場合、templateOperations を省略する（Req 4.12 パス）", () => {
    const body = buildUpdateCaseInput({
      name: "案件A",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      isCompleted: false,
    });
    expect(body).not.toHaveProperty("templateOperations");
  });

  it("オプションが提供されている場合、templateOperations を含む（空の配列を含む）（Req 4.13）", () => {
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
  it("日付が変更されていない場合、空の配列を返す（Req 4.12）", () => {
    expect(
      resolveEditApplyCandidates("2026-08-01", "2026-08-10", "2026-08-01", "2026-08-10"),
    ).toEqual([]);
  });

  it("開始日の変更を start_regenerate + month_regenerate にマッピングする（Req 4.6, 4.10）", () => {
    expect(
      resolveEditApplyCandidates("2026-08-01", "2026-08-10", "2026-09-01", "2026-08-10"),
    ).toEqual(["start_regenerate", "month_regenerate"]);
  });

  it("null→開始日と終了日を start_generate, end_generate, month_generate にマッピングする（Req 4.5, 4.8, 4.9）", () => {
    expect(resolveEditApplyCandidates(null, null, "2026-08-01", "2026-08-10")).toEqual([
      "start_generate",
      "end_generate",
      "month_generate",
    ]);
  });

  it("空の新しい日付文字列を未設定として扱う（Req 4.7, 4.11）", () => {
    expect(resolveEditApplyCandidates("2026-08-01", "2026-08-10", "", "")).toEqual([
      "start_delete",
      "end_delete",
      "month_delete",
    ]);
  });
});

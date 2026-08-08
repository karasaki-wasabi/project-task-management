// Helpers for RecurrencePage list columns (task 7.3).
// Requirements 1.3, 8.1, 8.3 — case-relative fields only (no kind / interval).
import { describe, expect, it } from "vitest";
import type { RecurringTaskTemplate } from "../../composables/useApiClient";
import { templateOffsetLabel, templatePolicyLabel, templateStatusBadge } from "./index.helpers";

function makeTemplate(
  overrides: Partial<RecurringTaskTemplate> = {},
): Pick<RecurringTaskTemplate, "caseAnchor" | "caseOffsetDays" | "nonBusinessDayPolicy" | "isActive"> {
  return {
    caseAnchor: "case_end",
    caseOffsetDays: 14,
    nonBusinessDayPolicy: "next_business_day",
    isActive: true,
    ...overrides,
  };
}

describe("templateStatusBadge", () => {
  it("returns 有効 / success for active templates", () => {
    expect(templateStatusBadge(true)).toEqual({ tone: "success", label: "有効" });
  });

  it("returns 停止中 / neutral for inactive templates", () => {
    expect(templateStatusBadge(false)).toEqual({ tone: "neutral", label: "停止中" });
  });
});

describe("templateOffsetLabel (caseAnchor + caseOffsetDays)", () => {
  it("formats case_end offset as N日前", () => {
    expect(templateOffsetLabel(makeTemplate({ caseAnchor: "case_end", caseOffsetDays: 14 }))).toBe(
      "案件終了日の14日前",
    );
  });

  it("formats case_start offset as N日後", () => {
    expect(templateOffsetLabel(makeTemplate({ caseAnchor: "case_start", caseOffsetDays: 3 }))).toBe(
      "案件開始日の3日後",
    );
  });

  it("formats zero offset as 当日", () => {
    expect(templateOffsetLabel(makeTemplate({ caseAnchor: "case_end", caseOffsetDays: 0 }))).toBe(
      "案件終了日当日",
    );
  });

  it("formats period_month_start / period_month_end anchors", () => {
    expect(
      templateOffsetLabel(makeTemplate({ caseAnchor: "period_month_start", caseOffsetDays: 1 })),
    ).toBe("各月初の1日後");
    expect(
      templateOffsetLabel(makeTemplate({ caseAnchor: "period_month_end", caseOffsetDays: 1 })),
    ).toBe("各月末の1日前");
  });
});

describe("templatePolicyLabel", () => {
  it("maps nonBusinessDayPolicy to Japanese labels", () => {
    expect(templatePolicyLabel(makeTemplate({ nonBusinessDayPolicy: "as_is" }))).toBe("そのまま登録");
    expect(templatePolicyLabel(makeTemplate({ nonBusinessDayPolicy: "skip" }))).toBe("登録しない");
    expect(templatePolicyLabel(makeTemplate({ nonBusinessDayPolicy: "next_business_day" }))).toBe(
      "次営業日に登録",
    );
    expect(templatePolicyLabel(makeTemplate({ nonBusinessDayPolicy: "previous_business_day" }))).toBe(
      "前営業日に登録",
    );
  });
});

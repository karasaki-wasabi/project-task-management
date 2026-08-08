import { describe, expect, it } from "vitest";
import { buildRegisterTemplateInput, validateRecurrenceForm } from "./RecurrenceFormModal.helpers";
import { formatOffsetLabel, offsetDirectionHint } from "./recurrenceLabels";

describe("RecurrenceFormModal.helpers", () => {
  it("requires title and non-negative integer offset", () => {
    expect(validateRecurrenceForm({
      title: "  ",
      priority: "medium",
      caseAnchor: "case_end",
      caseOffsetDays: 0,
      nonBusinessDayPolicy: "as_is",
      defaultMemo: "",
    }).valid).toBe(false);

    expect(validateRecurrenceForm({
      title: "x",
      priority: "medium",
      caseAnchor: "case_end",
      caseOffsetDays: -1,
      nonBusinessDayPolicy: "as_is",
      defaultMemo: "",
    }).valid).toBe(false);

    expect(validateRecurrenceForm({
      title: "x",
      priority: "medium",
      caseAnchor: "case_end",
      caseOffsetDays: 1.5,
      nonBusinessDayPolicy: "as_is",
      defaultMemo: "",
    }).valid).toBe(false);

    expect(validateRecurrenceForm({
      title: "x",
      priority: "medium",
      caseAnchor: "case_start",
      caseOffsetDays: 0,
      nonBusinessDayPolicy: "skip",
      defaultMemo: "",
    }).valid).toBe(true);
  });

  it("omits empty defaultMemo from register input", () => {
    expect(buildRegisterTemplateInput({
      title: "  kick  ",
      priority: "low",
      caseAnchor: "period_month_start",
      caseOffsetDays: 2,
      nonBusinessDayPolicy: "next_business_day",
      defaultMemo: "  ",
    })).toEqual({
      title: "kick",
      priority: "low",
      caseAnchor: "period_month_start",
      caseOffsetDays: 2,
      nonBusinessDayPolicy: "next_business_day",
    });
  });
});

describe("recurrenceLabels offset (Req 2.3 direction)", () => {
  it("formats non-negative fixed-direction labels", () => {
    expect(formatOffsetLabel("case_start", 0)).toBe("案件開始日当日");
    expect(formatOffsetLabel("case_start", 3)).toBe("案件開始日の3日後");
    expect(formatOffsetLabel("case_end", 14)).toBe("案件終了日の14日前");
    expect(formatOffsetLabel("period_month_start", 1)).toBe("各月初の1日後");
    expect(formatOffsetLabel("period_month_end", 1)).toBe("各月末の1日前");
  });

  it("hints describe fixed direction without signed offset", () => {
    expect(offsetDirectionHint("case_end")).toMatch(/指定日数前/);
    expect(offsetDirectionHint("case_start")).toMatch(/指定日数後/);
    expect(offsetDirectionHint("case_end")).not.toMatch(/負の数/);
  });
});

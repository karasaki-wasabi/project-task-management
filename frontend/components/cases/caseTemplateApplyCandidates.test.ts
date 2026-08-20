import { describe, expect, it } from "vitest";
import {
  buildCaseTemplateApplyCandidates,
  type CaseTemplateApplyOperation,
} from "./caseTemplateApplyCandidates";

type DateLike = string | null;

type Fixture = {
  name: string;
  oldStart: DateLike;
  oldEnd: DateLike;
  newStart: DateLike;
  newEnd: DateLike;
  expected: CaseTemplateApplyOperation[];
};

const PARITY_FIXTURES: Fixture[] = [
  {
    name: "start_generate when start goes null → value",
    oldStart: null,
    oldEnd: null,
    newStart: "2026-04-01",
    newEnd: null,
    expected: ["start_generate"],
  },
  {
    name: "start_regenerate when start value → other value",
    oldStart: "2026-04-01",
    oldEnd: null,
    newStart: "2026-04-15",
    newEnd: null,
    expected: ["start_regenerate"],
  },
  {
    name: "start_delete when start value → null",
    oldStart: "2026-04-01",
    oldEnd: null,
    newStart: null,
    newEnd: null,
    expected: ["start_delete"],
  },
  {
    name: "end_generate when end goes null → value",
    oldStart: null,
    oldEnd: null,
    newStart: null,
    newEnd: "2026-05-31",
    expected: ["end_generate"],
  },
  {
    name: "end_regenerate when end value → other value",
    oldStart: null,
    oldEnd: "2026-05-31",
    newStart: null,
    newEnd: "2026-06-30",
    expected: ["end_regenerate"],
  },
  {
    name: "end_delete when end value → null",
    oldStart: null,
    oldEnd: "2026-05-31",
    newStart: null,
    newEnd: null,
    expected: ["end_delete"],
  },
  {
    name: "month_generate on create with both dates",
    oldStart: null,
    oldEnd: null,
    newStart: "2026-04-01",
    newEnd: "2026-05-31",
    expected: ["start_generate", "end_generate", "month_generate"],
  },
  {
    name: "month_generate when missing end is filled",
    oldStart: "2026-04-01",
    oldEnd: null,
    newStart: "2026-04-01",
    newEnd: "2026-05-31",
    expected: ["end_generate", "month_generate"],
  },
  {
    name: "month_generate when missing start is filled",
    oldStart: null,
    oldEnd: "2026-05-31",
    newStart: "2026-04-01",
    newEnd: "2026-05-31",
    expected: ["start_generate", "month_generate"],
  },
  {
    name: "month_regenerate when start changes (both stay set)",
    oldStart: "2026-04-01",
    oldEnd: "2026-05-31",
    newStart: "2026-04-15",
    newEnd: "2026-05-31",
    expected: ["start_regenerate", "month_regenerate"],
  },
  {
    name: "month_regenerate when end changes (both stay set)",
    oldStart: "2026-04-01",
    oldEnd: "2026-05-31",
    newStart: "2026-04-01",
    newEnd: "2026-06-30",
    expected: ["end_regenerate", "month_regenerate"],
  },
  {
    name: "month_regenerate when both dates change",
    oldStart: "2026-04-01",
    oldEnd: "2026-05-31",
    newStart: "2026-04-15",
    newEnd: "2026-06-30",
    expected: ["start_regenerate", "end_regenerate", "month_regenerate"],
  },
  {
    name: "month_delete when start becomes unset",
    oldStart: "2026-04-01",
    oldEnd: "2026-05-31",
    newStart: null,
    newEnd: "2026-05-31",
    expected: ["start_delete", "month_delete"],
  },
  {
    name: "month_delete when end becomes unset",
    oldStart: "2026-04-01",
    oldEnd: "2026-05-31",
    newStart: "2026-04-01",
    newEnd: null,
    expected: ["end_delete", "month_delete"],
  },
  {
    name: "month_delete when both become unset",
    oldStart: "2026-04-01",
    oldEnd: "2026-05-31",
    newStart: null,
    newEnd: null,
    expected: ["start_delete", "end_delete", "month_delete"],
  },
  {
    name: "[] when create has no dates",
    oldStart: null,
    oldEnd: null,
    newStart: null,
    newEnd: null,
    expected: [],
  },
  {
    name: "[] when dates are unchanged (both set)",
    oldStart: "2026-04-01",
    oldEnd: "2026-05-31",
    newStart: "2026-04-01",
    newEnd: "2026-05-31",
    expected: [],
  },
  {
    name: "[] when dates are unchanged (only start)",
    oldStart: "2026-04-01",
    oldEnd: null,
    newStart: "2026-04-01",
    newEnd: null,
    expected: [],
  },
  {
    name: "[] when dates are unchanged (only end)",
    oldStart: null,
    oldEnd: "2026-05-31",
    newStart: null,
    newEnd: "2026-05-31",
    expected: [],
  },
];

describe("buildCaseTemplateApplyCandidates frontend/backend のパリティ（task 5.2）", () => {
  it.each(PARITY_FIXTURES)(
    "backend のキーと順序が一致する: $name",
    ({ oldStart, oldEnd, newStart, newEnd, expected }) => {
      expect(
        buildCaseTemplateApplyCandidates(oldStart, oldEnd, newStart, newEnd),
      ).toEqual(expected);
    },
  );

  describe("日付入力の正規化（backend と同じ）", () => {
    it("同等の Date と YYYY-MM-DD 文字列を同じカレンダー日として扱う", () => {
      expect(
        buildCaseTemplateApplyCandidates(
          new Date("2026-04-01T00:00:00.000Z"),
          new Date("2026-05-31T00:00:00.000Z"),
          "2026-04-01",
          "2026-05-31",
        ),
      ).toEqual([]);
    });

    it("undefined を null として扱う", () => {
      expect(
        buildCaseTemplateApplyCandidates(undefined, undefined, "2026-04-01", undefined),
      ).toEqual(["start_generate"]);
    });
  });
});

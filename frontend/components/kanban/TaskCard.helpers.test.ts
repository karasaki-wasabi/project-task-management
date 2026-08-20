import { describe, expect, it } from "vitest";
import {
  formatExcludedCancelledNote,
  formatProgress,
  shouldShowProgress,
  shouldShowStatus,
} from "./TaskCard.helpers";

describe("shouldShowProgress (task-status-model 5.5, Requirements 8.6, 8.9)", () => {
  it("progress が提供されていない場合（タスクにサブタスクがない）、false を返す", () => {
    expect(shouldShowProgress(undefined)).toBe(false);
  });

  it("progress が提供されていて、分母が正の場合、true を返す", () => {
    expect(shouldShowProgress({ completed: 0, total: 3, excludedCancelled: 0 })).toBe(true);
  });

  it("カウントされたサブタスクがすべて完了している場合、true を返す", () => {
    expect(shouldShowProgress({ completed: 3, total: 3, excludedCancelled: 0 })).toBe(true);
  });

  it("非中止の分母が 0 の場合、false を返す（Requirement 8.9）", () => {
    expect(shouldShowProgress({ completed: 0, total: 0, excludedCancelled: 2 })).toBe(false);
  });

  it("完了・中止の列で progress が提供されている場合、false を返す（task 5.5）", () => {
    expect(
      shouldShowProgress({ completed: 1, total: 2, excludedCancelled: 1 }, { isTerminalColumn: true }),
    ).toBe(false);
  });
});

describe("shouldShowStatus (task-status-model 5.5, Requirement 4.5)", () => {
  it("通常の列で true を返す", () => {
    expect(shouldShowStatus({ isTerminalColumn: false })).toBe(true);
  });

  it("完了・中止の列で false を返す", () => {
    expect(shouldShowStatus({ isTerminalColumn: true })).toBe(false);
  });
});

describe("formatExcludedCancelledNote (task-status-model 5.5, Requirement 8.6)", () => {
  it("中止されたサブタスクが除外されていない場合、null を返す", () => {
    expect(formatExcludedCancelledNote(0)).toBeNull();
  });

  it("中止されたサブタスクが除外されている場合、除外の理由を返す", () => {
    expect(formatExcludedCancelledNote(1)).toBe("中止 1 件を除く");
    expect(formatExcludedCancelledNote(3)).toBe("中止 3 件を除く");
  });
});

describe("formatProgress (task 1, Requirement 5.4)", () => {
  it("完了/合計を分数ラベルとしてフォーマットする", () => {
    expect(formatProgress({ completed: 2, total: 5, excludedCancelled: 0 })).toBe("2/5");
  });

  it("完了が 0 の場合、0/4 を返す", () => {
    expect(formatProgress({ completed: 0, total: 4, excludedCancelled: 1 })).toBe("0/4");
  });

  it("完了が合計と同じ場合、4/4 を返す", () => {
    expect(formatProgress({ completed: 4, total: 4, excludedCancelled: 0 })).toBe("4/4");
  });
});

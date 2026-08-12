import { describe, expect, it } from "vitest";
import {
  formatExcludedCancelledNote,
  formatProgress,
  shouldShowProgress,
  shouldShowStatus,
} from "./TaskCard.helpers";

describe("shouldShowProgress (task-status-model 5.5, Requirements 8.6, 8.9)", () => {
  it("returns false when no progress is supplied (task has no subtasks)", () => {
    expect(shouldShowProgress(undefined)).toBe(false);
  });

  it("returns true when progress is supplied with a positive denominator", () => {
    expect(shouldShowProgress({ completed: 0, total: 3, excludedCancelled: 0 })).toBe(true);
  });

  it("returns true even when all counted subtasks are complete", () => {
    expect(shouldShowProgress({ completed: 3, total: 3, excludedCancelled: 0 })).toBe(true);
  });

  it("returns false when the non-cancelled denominator is 0 (Requirement 8.9)", () => {
    expect(shouldShowProgress({ completed: 0, total: 0, excludedCancelled: 2 })).toBe(false);
  });

  it("returns false on a terminal column even when progress is supplied (task 5.5)", () => {
    expect(
      shouldShowProgress({ completed: 1, total: 2, excludedCancelled: 1 }, { isTerminalColumn: true }),
    ).toBe(false);
  });
});

describe("shouldShowStatus (task-status-model 5.5, Requirement 4.5)", () => {
  it("returns true on a normal column", () => {
    expect(shouldShowStatus({ isTerminalColumn: false })).toBe(true);
  });

  it("returns false on a terminal column", () => {
    expect(shouldShowStatus({ isTerminalColumn: true })).toBe(false);
  });
});

describe("formatExcludedCancelledNote (task-status-model 5.5, Requirement 8.6)", () => {
  it("returns null when no cancelled children were excluded", () => {
    expect(formatExcludedCancelledNote(0)).toBeNull();
  });

  it("returns the exclusion note when cancelled children were excluded", () => {
    expect(formatExcludedCancelledNote(1)).toBe("中止 1 件を除く");
    expect(formatExcludedCancelledNote(3)).toBe("中止 3 件を除く");
  });
});

describe("formatProgress (task 1, Requirement 5.4)", () => {
  it("formats completed/total as a fraction label", () => {
    expect(formatProgress({ completed: 2, total: 5, excludedCancelled: 0 })).toBe("2/5");
  });

  it("formats a zero-completed progress", () => {
    expect(formatProgress({ completed: 0, total: 4, excludedCancelled: 1 })).toBe("0/4");
  });

  it("formats a fully-completed progress", () => {
    expect(formatProgress({ completed: 4, total: 4, excludedCancelled: 0 })).toBe("4/4");
  });
});

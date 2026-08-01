import { describe, expect, it } from "vitest";
import { formatProgress, shouldShowProgress } from "./TaskCard.helpers";

describe("shouldShowProgress (task 1, Requirement 5.4/5.5)", () => {
  it("returns false when no progress is supplied (task has no subtasks)", () => {
    expect(shouldShowProgress(undefined)).toBe(false);
  });

  it("returns true when progress is supplied (task has subtasks)", () => {
    expect(shouldShowProgress({ completed: 0, total: 3 })).toBe(true);
  });

  it("returns true even when all subtasks are complete", () => {
    expect(shouldShowProgress({ completed: 3, total: 3 })).toBe(true);
  });
});

describe("formatProgress (task 1, Requirement 5.4)", () => {
  it("formats completed/total as a fraction label", () => {
    expect(formatProgress({ completed: 2, total: 5 })).toBe("2/5");
  });

  it("formats a zero-completed progress", () => {
    expect(formatProgress({ completed: 0, total: 4 })).toBe("0/4");
  });

  it("formats a fully-completed progress", () => {
    expect(formatProgress({ completed: 4, total: 4 })).toBe("4/4");
  });
});

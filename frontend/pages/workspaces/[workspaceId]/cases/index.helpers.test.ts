import { describe, expect, it } from "vitest";
import { computeStatusCounts, filterCases, matchesStatusFilter, type CaseRow } from "./index.helpers";

function makeCase(overrides: Partial<Case> & { id: string }): Case {
  return {
    name: `case-${overrides.id}`,
    startDate: null,
    endDate: "2026-08-01",
    isCompleted: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function makeRow(overrides: Partial<Case> & { id: string }, progress: CaseProgress | null): CaseRow {
  return { ...makeCase(overrides), progress };
}

function makeProgress(overrides: Partial<CaseProgress> = {}): CaseProgress {
  return {
    requiredTotal: 2,
    requiredCompleted: 1,
    requiredIncomplete: 1,
    isOverdueWithIncomplete: false,
    ...overrides,
  };
}

describe("matchesStatusFilter (Requirement 7.1/7.2 chip filtering)", () => {
  it("matches every row for the すべて (all) filter", () => {
    const row = makeRow({ id: "c1", isCompleted: true }, makeProgress());
    expect(matchesStatusFilter(row, "all")).toBe(true);
  });

  it("matches an incomplete case for the 進行中 (in_progress) filter", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, makeProgress());
    expect(matchesStatusFilter(row, "in_progress")).toBe(true);
  });

  it("does not match a completed case for the 進行中 (in_progress) filter", () => {
    const row = makeRow({ id: "c1", isCompleted: true }, makeProgress());
    expect(matchesStatusFilter(row, "in_progress")).toBe(false);
  });

  it("matches a completed case for the 完了 (completed) filter", () => {
    const row = makeRow({ id: "c1", isCompleted: true }, makeProgress());
    expect(matchesStatusFilter(row, "completed")).toBe(true);
  });

  it("does not match an incomplete case for the 完了 (completed) filter", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, makeProgress());
    expect(matchesStatusFilter(row, "completed")).toBe(false);
  });

  it("matches a row whose progress.isOverdueWithIncomplete is true for the 期限超過 (overdue) filter", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: true }));
    expect(matchesStatusFilter(row, "overdue")).toBe(true);
  });

  it("does not match a row whose progress.isOverdueWithIncomplete is false for the 期限超過 (overdue) filter", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: false }));
    expect(matchesStatusFilter(row, "overdue")).toBe(false);
  });

  it("does not match the 期限超過 (overdue) filter when progress has not loaded yet (null)", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, null);
    expect(matchesStatusFilter(row, "overdue")).toBe(false);
  });
});

describe("computeStatusCounts (Requirement 7.1/7.2 chip counts)", () => {
  it("counts all/in_progress/completed/overdue independently across the case list", () => {
    const rows: CaseRow[] = [
      makeRow({ id: "c1", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: true })),
      makeRow({ id: "c2", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: false })),
      makeRow({ id: "c3", isCompleted: true }, makeProgress({ isOverdueWithIncomplete: false })),
    ];
    expect(computeStatusCounts(rows)).toEqual({
      all: 3,
      in_progress: 2,
      completed: 1,
      overdue: 1,
    });
  });

  it("returns all-zero counts for an empty case list", () => {
    expect(computeStatusCounts([])).toEqual({ all: 0, in_progress: 0, completed: 0, overdue: 0 });
  });

  it("treats a row with no progress yet as not overdue but still counted in all/in_progress", () => {
    const rows: CaseRow[] = [makeRow({ id: "c1", isCompleted: false }, null)];
    expect(computeStatusCounts(rows)).toEqual({ all: 1, in_progress: 1, completed: 0, overdue: 0 });
  });
});

describe("filterCases (Requirement 7.3 name search combined with status chip)", () => {
  const rows: CaseRow[] = [
    makeRow({ id: "c1", name: "サイト改修", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: true })),
    makeRow({ id: "c2", name: "サイト新規構築", isCompleted: true }, makeProgress({ isOverdueWithIncomplete: false })),
    makeRow({ id: "c3", name: "資料作成", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: false })),
  ];

  it("returns every row when search text is empty and filter is all", () => {
    expect(filterCases(rows, "", "all")).toEqual(rows);
  });

  it("filters by case-insensitive substring match on name", () => {
    expect(filterCases(rows, "サイト", "all")).toEqual([rows[0], rows[1]]);
  });

  it("filters by status chip alone", () => {
    expect(filterCases(rows, "", "completed")).toEqual([rows[1]]);
  });

  it("combines name search and status chip filters", () => {
    expect(filterCases(rows, "サイト", "overdue")).toEqual([rows[0]]);
  });

  it("returns an empty array when the search+filter combination matches nothing", () => {
    expect(filterCases(rows, "存在しない案件", "all")).toEqual([]);
  });

  it("trims and lowercases search text before matching", () => {
    const upper: CaseRow[] = [makeRow({ id: "c1", name: "ProjectAlpha", isCompleted: false }, makeProgress())];
    expect(filterCases(upper, "  projectalpha  ", "all")).toEqual(upper);
  });
});

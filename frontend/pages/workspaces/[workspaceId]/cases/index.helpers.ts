// Pure derived-data logic for the cases index page (task 6.1, design.md
// "Frontend / cases > cases index page", Requirements 1.1, 7.1, 7.2, 7.3).
// Extracted from the .vue SFC so it can be unit-tested without mounting a
// component (this repo has no @vue/test-utils / DOM test environment
// configured, see frontend/vitest.config.ts) — same pattern as
// frontend/pages/kanban/index.helpers.ts.
export interface CaseRow extends Case {
  progress: CaseProgress | null;
}

export type CaseStatusFilter = "all" | "in_progress" | "completed" | "overdue";

export interface CaseStatusCounts {
  all: number;
  in_progress: number;
  completed: number;
  overdue: number;
}

// research.md section 6 / design.md "cases index page": すべて/進行中/完了/
// 期限超過 chips, computed client-side from listCases + getCaseProgress
// results (no dedicated backend endpoint). 進行中 = not isCompleted (mirrors
// Requirement 6.2's rule that a manually-completed case is never overdue,
// so "in progress" here just means "not yet marked complete", independent
// of whether it's also overdue). 完了 = isCompleted. 期限超過 =
// progress.isOverdueWithIncomplete (Requirement 6.1/6.2); a row whose
// progress hasn't loaded yet (null) is never counted as overdue.
export function matchesStatusFilter(row: CaseRow, filter: CaseStatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "in_progress":
      return !row.isCompleted;
    case "completed":
      return row.isCompleted;
    case "overdue":
      return row.progress?.isOverdueWithIncomplete ?? false;
  }
}

// Requirement 7.1/7.2: per-chip counts, always computed against the full
// (unfiltered) case list so every chip shows how many cases it would
// reveal regardless of which chip (or search text) is currently active.
export function computeStatusCounts(rows: CaseRow[]): CaseStatusCounts {
  const counts: CaseStatusCounts = { all: 0, in_progress: 0, completed: 0, overdue: 0 };
  for (const row of rows) {
    counts.all += 1;
    if (matchesStatusFilter(row, "in_progress")) counts.in_progress += 1;
    if (matchesStatusFilter(row, "completed")) counts.completed += 1;
    if (matchesStatusFilter(row, "overdue")) counts.overdue += 1;
  }
  return counts;
}

// Requirement 7.3: name search (case-insensitive substring, trimmed)
// combined with the currently-selected status chip.
export function filterCases(rows: CaseRow[], searchText: string, filter: CaseStatusFilter): CaseRow[] {
  const normalized = searchText.trim().toLowerCase();
  return rows.filter(
    (row) => row.name.toLowerCase().includes(normalized) && matchesStatusFilter(row, filter),
  );
}

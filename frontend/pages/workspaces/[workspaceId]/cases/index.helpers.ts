
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

export function filterCases(rows: CaseRow[], searchText: string, filter: CaseStatusFilter): CaseRow[] {
  const normalized = searchText.trim().toLowerCase();
  return rows.filter(
    (row) => row.name.toLowerCase().includes(normalized) && matchesStatusFilter(row, filter),
  );
}

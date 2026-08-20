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

describe("チップフィルタリング (Requirement 7.1/7.2 )", () => {
  it("全案件の表示", () => {
    const row = makeRow({ id: "c1", isCompleted: true }, makeProgress());
    expect(matchesStatusFilter(row, "all")).toBe(true);
  });

  it("進行中の案件の表示", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, makeProgress());
    expect(matchesStatusFilter(row, "in_progress")).toBe(true);
  });

  it("完了した案件の表示", () => {
    const row = makeRow({ id: "c1", isCompleted: true }, makeProgress());
    expect(matchesStatusFilter(row, "in_progress")).toBe(false);
  });

  it("完了した案件の表示", () => {
    const row = makeRow({ id: "c1", isCompleted: true }, makeProgress());
    expect(matchesStatusFilter(row, "completed")).toBe(true);
  });

  it("進行中の案件の表示", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, makeProgress());
    expect(matchesStatusFilter(row, "completed")).toBe(false);
  });

  it("期限超過フィルタで、期限超過となっている案件を表示", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: true }));
    expect(matchesStatusFilter(row, "overdue")).toBe(true);
  });

  it("期限超過フィルタで、期限超過となっていない案件は表示しない", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: false }));
    expect(matchesStatusFilter(row, "overdue")).toBe(false);
  });

  it("期限超過フィルタで、進捗が未読み込みの場合は表示しない", () => {
    const row = makeRow({ id: "c1", isCompleted: false }, null);
    expect(matchesStatusFilter(row, "overdue")).toBe(false);
  });
});

describe("チップカウント (Requirement 7.1/7.2 )", () => {
  it("全案件、進行中、完了、期限超過のカウントを独立して計算", () => {
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

  it("空の案件リストの場合、全カウントを0に設定", () => {
    expect(computeStatusCounts([])).toEqual({ all: 0, in_progress: 0, completed: 0, overdue: 0 });
  });

  it("進捗が未読み込みの場合、期限超過ではないが、全案件、進行中のカウントに含める", () => {
    const rows: CaseRow[] = [makeRow({ id: "c1", isCompleted: false }, null)];
    expect(computeStatusCounts(rows)).toEqual({ all: 1, in_progress: 1, completed: 0, overdue: 0 });
  });
});

describe("フィルタリング (Requirement 7.3)", () => {
  const rows: CaseRow[] = [
    makeRow({ id: "c1", name: "サイト改修", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: true })),
    makeRow({ id: "c2", name: "サイト新規構築", isCompleted: true }, makeProgress({ isOverdueWithIncomplete: false })),
    makeRow({ id: "c3", name: "資料作成", isCompleted: false }, makeProgress({ isOverdueWithIncomplete: false })),
  ];

  it("全案件の表示", () => {
    expect(filterCases(rows, "", "all")).toEqual(rows);
  });

  it("案件名の部分一致でフィルタリング", () => {
    expect(filterCases(rows, "サイト", "all")).toEqual([rows[0], rows[1]]);
  });

  it("完了した案件の表示", () => {
    expect(filterCases(rows, "", "completed")).toEqual([rows[1]]);
  });

  it("案件名の部分一致と期限超過フィルタの組み合わせでフィルタリング", () => {
    expect(filterCases(rows, "サイト", "overdue")).toEqual([rows[0]]);
  });

  it("検索とフィルタの組み合わせで一致しない場合、空の配列を返す", () => {
    expect(filterCases(rows, "存在しない案件", "all")).toEqual([]);
  });

  it("検索テキストをトリムし、大文字小文字を区別しないでマッチング", () => {
    const upper: CaseRow[] = [makeRow({ id: "c1", name: "ProjectAlpha", isCompleted: false }, makeProgress())];
    expect(filterCases(upper, "  projectalpha  ", "all")).toEqual(upper);
  });
});

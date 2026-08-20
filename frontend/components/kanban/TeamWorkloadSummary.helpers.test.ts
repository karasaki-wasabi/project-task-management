import { describe, expect, it } from "vitest";
import { isOverloaded, remainderCount, splitVisibleWorkload, WORKLOAD_OVERLOAD_THRESHOLD, type WorkloadCount } from "./TeamWorkloadSummary.helpers";

function makeUser(id: string, name: string): User {
  return { id, name, createdAt: "", updatedAt: "" };
}

function makeCounts(n: number): WorkloadCount[] {
  return Array.from({ length: n }, (_, i) => ({
    user: makeUser(`u${i}`, `User${i}`),
    count: n - i,
  }));
}

describe("splitVisibleWorkload (task 2.2, Requirement 2.4/2.5)", () => {
  it("count が maxVisible 以内の場合、すべてのエントリを表示し、余りを表示しない", () => {
    const counts = makeCounts(3);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible).toEqual(counts);
    expect(result.remainder).toEqual([]);
  });

  it("10 個のエントリを上位 N 個の表示可能なチップと残りのエントリに分割する", () => {
    const counts = makeCounts(10);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible).toHaveLength(5);
    expect(result.visible).toEqual(counts.slice(0, 5));
    expect(result.remainder).toHaveLength(5);
    expect(result.remainder).toEqual(counts.slice(5));
  });

  it("呼び出し元が提供した順序を保持する（再ソートしない）", () => {
    const counts = makeCounts(10);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible.map((c) => c.user.id)).toEqual(["u0", "u1", "u2", "u3", "u4"]);
    expect(result.remainder.map((c) => c.user.id)).toEqual(["u5", "u6", "u7", "u8", "u9"]);
  });

  it("余りのエントリを個別に名前とカウントで検査可能にする", () => {
    const counts = makeCounts(10);
    const result = splitVisibleWorkload(counts, 5);
    for (const entry of result.remainder) {
      expect(entry.user.name).toBeTruthy();
      expect(typeof entry.count).toBe("number");
    }
  });

  it("counts.length === maxVisible の場合、すべてのエントリを表示し、余りを表示しない", () => {
    const counts = makeCounts(5);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible).toEqual(counts);
    expect(result.remainder).toEqual([]);
  });

  it("counts.length が maxVisible より 1 つ多い場合、上位 N 個のエントリを表示し、1 つの余りのエントリを表示する", () => {
    const counts = makeCounts(6);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible).toEqual(counts.slice(0, 5));
    expect(result.remainder).toHaveLength(1);
    expect(result.remainder).toEqual([counts[5]]);
  });

  it("maxVisible が負の場合、何も表示しない", () => {
    const counts = makeCounts(3);
    const result = splitVisibleWorkload(counts, -1);
    expect(result.visible).toEqual([]);
    expect(result.remainder).toEqual(counts);
  });

  it("counts が空の配列の場合、何も表示しない", () => {
    const result = splitVisibleWorkload([], 5);
    expect(result.visible).toEqual([]);
    expect(result.remainder).toEqual([]);
  });
});

describe("remainderCount (task 2.2, Requirement 2.4)", () => {
  it("何も溢れない場合、0 を返す", () => {
    expect(remainderCount(makeCounts(3), 5)).toBe(0);
  });

  it("maxVisible が 5 の場合、10 個のエントリに対して折りたたまれた担当者の数を返す", () => {
    expect(remainderCount(makeCounts(10), 5)).toBe(5);
  });
});

describe("isOverloaded（閾値ベース、ランクベースではない）", () => {
  it("閾値以下の場合、false を返す", () => {
    expect(isOverloaded(0)).toBe(false);
    expect(isOverloaded(WORKLOAD_OVERLOAD_THRESHOLD)).toBe(false);
  });

  it("閾値を超えた場合、true を返す", () => {
    expect(isOverloaded(WORKLOAD_OVERLOAD_THRESHOLD + 1)).toBe(true);
  });

  it("ランクに依存しない — カウントが低いものが高いものを上書きしない", () => {
    // index 0 (top of a caller-sorted list) must not be flagged merely for
    // being first; only its own count against the threshold matters.
    const topOfSortButNotOverloaded = 3;
    expect(isOverloaded(topOfSortButNotOverloaded)).toBe(false);
  });
});

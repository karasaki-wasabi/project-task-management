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
  it("returns all entries as visible and no remainder when count is within maxVisible", () => {
    const counts = makeCounts(3);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible).toEqual(counts);
    expect(result.remainder).toEqual([]);
  });

  it("splits 10 entries into top-N visible chips and the rest as remainder", () => {
    const counts = makeCounts(10);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible).toHaveLength(5);
    expect(result.visible).toEqual(counts.slice(0, 5));
    expect(result.remainder).toHaveLength(5);
    expect(result.remainder).toEqual(counts.slice(5));
  });

  it("preserves the caller-supplied order (no re-sorting)", () => {
    const counts = makeCounts(10);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible.map((c) => c.user.id)).toEqual(["u0", "u1", "u2", "u3", "u4"]);
    expect(result.remainder.map((c) => c.user.id)).toEqual(["u5", "u6", "u7", "u8", "u9"]);
  });

  it("keeps each remainder entry individually inspectable with name and count", () => {
    const counts = makeCounts(10);
    const result = splitVisibleWorkload(counts, 5);
    for (const entry of result.remainder) {
      expect(entry.user.name).toBeTruthy();
      expect(typeof entry.count).toBe("number");
    }
  });

  it("treats an exact fit (counts.length === maxVisible) as all visible, no remainder", () => {
    const counts = makeCounts(5);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible).toEqual(counts);
    expect(result.remainder).toEqual([]);
  });

  it("treats one-over-the-limit as top-N visible plus a single remainder entry", () => {
    const counts = makeCounts(6);
    const result = splitVisibleWorkload(counts, 5);
    expect(result.visible).toEqual(counts.slice(0, 5));
    expect(result.remainder).toHaveLength(1);
    expect(result.remainder).toEqual([counts[5]]);
  });

  it("treats a negative maxVisible as showing nothing directly", () => {
    const counts = makeCounts(3);
    const result = splitVisibleWorkload(counts, -1);
    expect(result.visible).toEqual([]);
    expect(result.remainder).toEqual(counts);
  });

  it("handles an empty counts array", () => {
    const result = splitVisibleWorkload([], 5);
    expect(result.visible).toEqual([]);
    expect(result.remainder).toEqual([]);
  });
});

describe("remainderCount (task 2.2, Requirement 2.4)", () => {
  it("returns 0 when nothing overflows", () => {
    expect(remainderCount(makeCounts(3), 5)).toBe(0);
  });

  it("returns the number of folded-away assignees for 10 entries with maxVisible 5", () => {
    expect(remainderCount(makeCounts(10), 5)).toBe(5);
  });
});

describe("isOverloaded (threshold-based, not rank-based)", () => {
  it("is false at and below the threshold", () => {
    expect(isOverloaded(0)).toBe(false);
    expect(isOverloaded(WORKLOAD_OVERLOAD_THRESHOLD)).toBe(false);
  });

  it("is true only past the threshold", () => {
    expect(isOverloaded(WORKLOAD_OVERLOAD_THRESHOLD + 1)).toBe(true);
  });

  it("does not depend on rank — a lower count never overrides a higher one", () => {
    // index 0 (top of a caller-sorted list) must not be flagged merely for
    // being first; only its own count against the threshold matters.
    const topOfSortButNotOverloaded = 3;
    expect(isOverloaded(topOfSortButNotOverloaded)).toBe(false);
  });
});

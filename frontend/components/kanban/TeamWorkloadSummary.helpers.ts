// Pure display-decision logic for TeamWorkloadSummary (task 2.2, design.md
// "TeamWorkloadSummary" component detail block, Requirement 2.2/2.4/2.5).
// Extracted from the .vue SFC so it can be unit-tested without mounting a
// component (this repo has no @vue/test-utils / DOM test environment
// configured, see frontend/vitest.config.ts).
//
// The caller (kanban/index.vue) is responsible for aggregation and
// descending sort order (Requirement 2.1/2.3) — this component (and this
// helper) only decide, given an already-sorted array and a visible-count
// limit, which entries render as chips and which get folded into "+N名".
export interface WorkloadCount {
  user: User;
  count: number;
}

export interface VisibleWorkload {
  visible: WorkloadCount[];
  remainder: WorkloadCount[];
}

// Requirement 2.4: when the number of assignees exceeds what fits on
// screen, show the top `maxVisible` (by the caller's sort order) as chips
// and fold the rest into a single "+N名" summary.
// Requirement 2.5: the folded entries must remain individually inspectable
// (name + count each) — this is `remainder`, unsummarized.
export function splitVisibleWorkload(counts: WorkloadCount[], maxVisible: number): VisibleWorkload {
  if (maxVisible < 0) {
    return { visible: [], remainder: [...counts] };
  }
  return {
    visible: counts.slice(0, maxVisible),
    remainder: counts.slice(maxVisible),
  };
}

// Requirement 2.4: the "+N名" label's count is simply the remainder size.
export function remainderCount(counts: WorkloadCount[], maxVisible: number): number {
  return splitVisibleWorkload(counts, maxVisible).remainder.length;
}

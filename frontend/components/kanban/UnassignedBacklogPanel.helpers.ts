// Pure display-decision logic for UnassignedBacklogPanel (task 2.3,
// design.md "UnassignedBacklogPanel" component detail block, Requirement
// 3.4/3.5/3.6). Extracted from the .vue SFC so it can be unit-tested without
// mounting a component (this repo has no @vue/test-utils / DOM test
// environment configured, see frontend/vitest.config.ts).

export type BacklogSortKey = "priority" | "createdAt";

// Requirement 3.4: title keyword search. Decision: case-insensitive
// substring match against `task.title`. An empty/whitespace-only query
// matches every task (i.e. "no filter applied"), which keeps the expanded
// list showing everything until the user actually types something.
export function filterTasksByTitle(tasks: Task[], query: string): Task[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") {
    return [...tasks];
  }
  return tasks.filter((task) => task.title.toLowerCase().includes(normalizedQuery));
}

// Requirement 3.5: priority sort order. Decision: high -> medium -> low,
// since a backlog being triaged should surface the most urgent items first.
const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// Requirement 3.5: sort by priority or createdAt.
// - "priority": high -> medium -> low (see PRIORITY_ORDER above). Ties
//   (same priority) preserve the original relative order (stable sort).
// - "createdAt": newest-first (descending). Decision: someone triaging a
//   growing backlog most likely wants to see what just landed at the top,
//   rather than scrolling past old entries first. Ties (identical
//   timestamps) preserve the original relative order (stable sort).
// Returns a new array; the input array is not mutated.
export function sortTasks(tasks: Task[], sortKey: BacklogSortKey): Task[] {
  const copy = [...tasks];
  if (sortKey === "priority") {
    return copy.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }
  return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

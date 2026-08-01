// Pure reorder logic for DevelopmentStageManager (task 3, design.md
// "stages.vue + DevelopmentStageManager" component detail block,
// Requirement 7.3). Extracted from the .vue SFC so the swap decision can be
// unit-tested without mounting a component (this repo has no
// @vue/test-utils / DOM test environment configured, see
// frontend/vitest.config.ts).
//
// This is a relocation of the array-swap logic that previously lived inline
// in `frontend/pages/kanban/index.vue`'s `moveStage` — behavior is
// unchanged, only extracted into a pure function.

// Given an ordered list of stage ids, returns a new array with the id at
// `index` swapped with its neighbor in `direction` (-1 = up, 1 = down).
// Returns `null` when the swap would go out of bounds (already at the
// first/last position), signaling the caller should skip the API call.
export function swapStageOrder(orderedIds: string[], index: number, direction: -1 | 1): string[] | null {
  const target = index + direction;
  if (target < 0 || target >= orderedIds.length) return null;
  const result = [...orderedIds];
  // `target` and `index` are both verified in-bounds above, so these
  // lookups are never `undefined` — non-null assertions avoid a new
  // `noUncheckedIndexedAccess` typecheck error (a pre-existing one from the
  // same swap pattern already exists in the un-relocated `index.vue`, see
  // this task's validation notes; this file must not add another).
  const atIndex = result[index]!;
  const atTarget = result[target]!;
  result[index] = atTarget;
  result[target] = atIndex;
  return result;
}

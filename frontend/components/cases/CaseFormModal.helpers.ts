// Pure logic for CaseFormModal (task 6.2, design.md "Frontend / cases >
// CaseFormModal" + System Flow「案件新規作成」, Requirements 2.3/2.4, 3.1-3.7).
// Extracted from the .vue SFC so it can be unit-tested without mounting a
// component (helper tests) and to keep submit decisions free of DOM details.
// Mount coverage for confirm → create → associate lives in CaseFormModal.test.ts.

import type { MissingDates } from "./CaseTemplateApplyConfirm.helpers";

// Requirement 3.3: "選択された各タスクについて…個別に指定できる" — the
// required flag is only meaningful for a selected task. Modeled as a single
// per-task record (rather than two parallel Sets) so "selected" and
// "isRequiredForCase" can never drift into an inconsistent combination
// (e.g. required=true while selected=false) without going through the
// helpers below, which enforce that invariant.
export interface TaskSelectionState {
  selected: boolean;
  isRequiredForCase: boolean;
}

export type SelectionState = Record<string, TaskSelectionState>;

// Requirement 3.1: every fetched unassigned task starts unselected, with
// its required flag off (Requirement 3.5's default for a selected-but-
// unspecified task also happens to be false, so this doubles as that
// default).
export function initSelectionState(tasks: Task[]): SelectionState {
  const state: SelectionState = {};
  for (const task of tasks) {
    state[task.id] = { selected: false, isRequiredForCase: false };
  }
  return state;
}

// Requirement 3.2/3.7: toggling a task's selection on/off. Turning
// selection OFF also resets isRequiredForCase to false — Requirement 3.3
// frames the required flag as meaningful only "for each selected task", so
// an unselected task carrying a stale required=true would be a latent
// inconsistency (and would surface as a confusing pre-checked toggle if the
// row were re-selected later). Returns a new object; the input is not
// mutated.
export function setSelected(state: SelectionState, taskId: string, selected: boolean): SelectionState {
  const current = state[taskId] ?? { selected: false, isRequiredForCase: false };
  return {
    ...state,
    [taskId]: { selected, isRequiredForCase: selected ? current.isRequiredForCase : false },
  };
}

// Requirement 3.3/3.4: toggling the required flag. A no-op (returns the
// same state unchanged) when the task isn't currently selected — the UI
// keeps this toggle inert/hidden for unselected rows, and this helper
// enforces the same rule at the data layer so it can't be bypassed.
export function setRequired(state: SelectionState, taskId: string, isRequiredForCase: boolean): SelectionState {
  const current = state[taskId];
  if (!current || !current.selected) return state;
  return { ...state, [taskId]: { ...current, isRequiredForCase } };
}

// "すべて選択"/解除 affordance: applies `selected` to exactly the given
// (typically currently-visible/filtered) task ids, leaving every other
// entry untouched. Deselecting via this path also resets isRequiredForCase
// for the affected ids, same as setSelected.
export function selectAll(state: SelectionState, taskIds: string[], selected: boolean): SelectionState {
  const next = { ...state };
  for (const taskId of taskIds) {
    const current = next[taskId] ?? { selected: false, isRequiredForCase: false };
    next[taskId] = { selected, isRequiredForCase: selected ? current.isRequiredForCase : false };
  }
  return next;
}

// Whether every one of the given task ids is currently selected — drives
// the "すべて選択"/"すべて解除" label toggle. An empty id list (e.g. a
// search with no matches) is considered "not all selected" so the button
// reads as an actionable "select all" rather than a misleading "deselect".
export function isAllSelected(state: SelectionState, taskIds: string[]): boolean {
  return taskIds.length > 0 && taskIds.every((id) => state[id]?.selected === true);
}

// Requirement 3.2/3.4/3.5/3.7: builds the ordered list of updateTask calls
// to make for the current form state — only SELECTED tasks are included
// (Requirement 3.7 allows zero, which just yields an empty array), each
// carrying its own isRequiredForCase flag (defaulting to false per
// Requirement 3.5 when never toggled on). Order follows `Object.entries`
// insertion order, i.e. the order tasks were added to the selection state
// (fetch order), which is also the order design.md's System Flow calls
// them sequentially.
export function buildTaskAssociationCalls(state: SelectionState): Array<{ taskId: string; isRequiredForCase: boolean }> {
  return Object.entries(state)
    .filter(([, value]) => value.selected)
    .map(([taskId, value]) => ({ taskId, isRequiredForCase: value.isRequiredForCase }));
}

// Requirement 3.4: title keyword search over the unassigned-task list.
// Case-insensitive substring match; an empty/whitespace-only query matches
// everything. Mirrors kanban/UnassignedBacklogPanel.helpers.ts'
// filterTasksByTitle (same UI pattern, different domain — kept
// self-contained here per this component's own module boundary).
export function filterTasksByTitle(tasks: Task[], query: string): Task[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") return [...tasks];
  return tasks.filter((task) => task.title.toLowerCase().includes(normalizedQuery));
}

export interface CaseFormValidationResult {
  valid: boolean;
  error?: string;
}

// Requirement 2.3/2.4: client-side mirror of the backend's create-case
// validation (name required, startDate/endDate both optional, startDate <=
// endDate only enforced when both are present). The backend re-validates
// independently (design.md Error Handling) — this is purely to avoid a
// round-trip for the common mistakes.
export function validateCaseForm(input: { name: string; startDate: string; endDate: string }): CaseFormValidationResult {
  if (input.name.trim() === "") {
    return { valid: false, error: "案件名を入力してください" };
  }
  if (input.startDate.trim() !== "" && input.endDate.trim() !== "" && input.startDate > input.endDate) {
    return { valid: false, error: "開始日は終了日より前の日付を指定してください" };
  }
  return { valid: true };
}

// Requirements 3.1 / 3.5 / 3.6: both dates set → null (skip screen A).
// Otherwise which date(s) are unset for CaseTemplateApplyConfirm.
export function resolveMissingDates(startDate: string, endDate: string): MissingDates | null {
  const startMissing = startDate.trim() === "";
  const endMissing = endDate.trim() === "";
  if (!startMissing && !endMissing) return null;
  if (startMissing && endMissing) return "both";
  if (startMissing) return "start";
  return "end";
}

// Create payload always omits templateOperations (design.md: omit → server
// full candidates). Empty dates are omitted so partial/both-missing create
// still lets the server derive apply ops from the dates that are present
// (both missing → empty candidates → no template tasks).
export function buildCreateCaseInput(input: {
  name: string;
  startDate: string;
  endDate: string;
}): { name: string; startDate?: string; endDate?: string } {
  const body: { name: string; startDate?: string; endDate?: string } = {
    name: input.name.trim(),
  };
  if (input.startDate.trim() !== "") {
    body.startDate = input.startDate.trim();
  }
  if (input.endDate.trim() !== "") {
    body.endDate = input.endDate.trim();
  }
  return body;
}

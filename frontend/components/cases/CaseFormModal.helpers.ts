import type { MissingDates } from "./CaseTemplateApplyConfirm.helpers";

export interface TaskSelectionState {
  selected: boolean;
  isRequiredForCase: boolean;
}

export type SelectionState = Record<string, TaskSelectionState>;

export function initSelectionState(tasks: Task[]): SelectionState {
  const state: SelectionState = {};
  for (const task of tasks) {
    state[task.id] = { selected: false, isRequiredForCase: false };
  }
  return state;
}

export function setSelected(state: SelectionState, taskId: string, selected: boolean): SelectionState {
  const current = state[taskId] ?? { selected: false, isRequiredForCase: false };
  return {
    ...state,
    [taskId]: { selected, isRequiredForCase: selected ? current.isRequiredForCase : false },
  };
}

export function setRequired(state: SelectionState, taskId: string, isRequiredForCase: boolean): SelectionState {
  const current = state[taskId];
  if (!current || !current.selected) return state;
  return { ...state, [taskId]: { ...current, isRequiredForCase } };
}

export function selectAll(state: SelectionState, taskIds: string[], selected: boolean): SelectionState {
  const next = { ...state };
  for (const taskId of taskIds) {
    const current = next[taskId] ?? { selected: false, isRequiredForCase: false };
    next[taskId] = { selected, isRequiredForCase: selected ? current.isRequiredForCase : false };
  }
  return next;
}

export function isAllSelected(state: SelectionState, taskIds: string[]): boolean {
  return taskIds.length > 0 && taskIds.every((id) => state[id]?.selected === true);
}

export function buildTaskAssociationCalls(state: SelectionState): Array<{ taskId: string; isRequiredForCase: boolean }> {
  return Object.entries(state)
    .filter(([, value]) => value.selected)
    .map(([taskId, value]) => ({ taskId, isRequiredForCase: value.isRequiredForCase }));
}

export function filterTasksByTitle(tasks: Task[], query: string): Task[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") return [...tasks];
  return tasks.filter((task) => task.title.toLowerCase().includes(normalizedQuery));
}

export interface CaseFormValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCaseForm(input: { name: string; startDate: string; endDate: string }): CaseFormValidationResult {
  if (input.name.trim() === "") {
    return { valid: false, error: "案件名を入力してください" };
  }
  if (input.startDate.trim() !== "" && input.endDate.trim() !== "" && input.startDate > input.endDate) {
    return { valid: false, error: "開始日は終了日より前の日付を指定してください" };
  }
  return { valid: true };
}

export function resolveMissingDates(startDate: string, endDate: string): MissingDates | null {
  const startMissing = startDate.trim() === "";
  const endMissing = endDate.trim() === "";
  if (!startMissing && !endMissing) return null;
  if (startMissing && endMissing) return "both";
  if (startMissing) return "start";
  return "end";
}

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

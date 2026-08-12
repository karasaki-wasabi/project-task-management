// Pure display-decision logic for TaskCard (task-status-model 5.5,
// design.md "TaskCard"; Requirements 4.5, 8.6, 8.9). Extracted from the .vue
// SFC so it can be unit-tested without mounting a component (this repo's
// helpers pattern — see frontend/vitest.config.ts / Nuxt auto-import gap).
export interface TaskProgress {
  completed: number;
  total: number;
  excludedCancelled: number;
}

export interface TaskCardDisplayOptions {
  isTerminalColumn?: boolean;
}

// Progress is shown only when the caller supplies a positive non-cancelled
// denominator, and never on a terminal column (Requirements 8.6, 8.9).
export function shouldShowProgress(
  progress: TaskProgress | undefined,
  options: TaskCardDisplayOptions = {},
): boolean {
  if (options.isTerminalColumn) {
    return false;
  }
  if (progress === undefined) {
    return false;
  }
  return progress.total > 0;
}

// Requirement 4.5: terminal columns omit the status badge.
export function shouldShowStatus(options: TaskCardDisplayOptions): boolean {
  return !options.isTerminalColumn;
}

// Requirement 8.6: annotate only when cancelled children were excluded.
export function formatExcludedCancelledNote(excludedCancelled: number): string | null {
  if (excludedCancelled <= 0) {
    return null;
  }
  return `中止 ${excludedCancelled} 件を除く`;
}

export function formatProgress(progress: TaskProgress): string {
  return `${progress.completed}/${progress.total}`;
}

export interface TaskProgress {
  completed: number;
  total: number;
  excludedCancelled: number;
}

export interface TaskCardDisplayOptions {
  isTerminalColumn?: boolean;
}

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

export function shouldShowStatus(options: TaskCardDisplayOptions): boolean {
  return !options.isTerminalColumn;
}

export function formatExcludedCancelledNote(excludedCancelled: number): string | null {
  if (excludedCancelled <= 0) {
    return null;
  }
  return `中止 ${excludedCancelled} 件を除く`;
}

export function formatProgress(progress: TaskProgress): string {
  return `${progress.completed}/${progress.total}`;
}

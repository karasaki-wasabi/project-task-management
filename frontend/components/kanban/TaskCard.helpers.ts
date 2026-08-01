// Pure display-decision logic for TaskCard (task 1, design.md "TaskCard"
// component detail block, Requirement 5.4/5.5). Extracted from the .vue SFC
// so it can be unit-tested without mounting a component (this repo has no
// @vue/test-utils / DOM test environment configured, see
// frontend/vitest.config.ts).
export interface TaskProgress {
  completed: number;
  total: number;
}

// Requirement 5.4/5.5: progress is shown only when the caller supplies it
// (i.e. the task has subtasks); otherwise no progress indicator is rendered.
export function shouldShowProgress(progress: TaskProgress | undefined): boolean {
  return progress !== undefined;
}

// Renders a `completed/total` label for a supplied progress value.
export function formatProgress(progress: TaskProgress): string {
  return `${progress.completed}/${progress.total}`;
}

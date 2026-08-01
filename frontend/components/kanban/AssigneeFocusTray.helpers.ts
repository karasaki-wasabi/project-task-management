// Pure display-decision logic for AssigneeFocusTray (task 2.1, design.md
// "AssigneeFocusTray" component detail block, Requirement 1.2/1.5).
// Extracted from the .vue SFC so it can be unit-tested without mounting a
// component (this repo has no @vue/test-utils / DOM test environment
// configured, see frontend/vitest.config.ts).

// Requirement 1.2: the tray renders each task via TaskCard, which accepts an
// optional `assigneeName` for display. This resolves a task's
// `assigneeUserId` against the caller-supplied `users` list.
export function resolveAssigneeName(users: User[], userId: string | null | undefined): string | undefined {
  if (!userId) {
    return undefined;
  }
  return users.find((user) => user.id === userId)?.name;
}

// Requirement 1.5: when the selected assignee has zero incomplete tasks, the
// tray shows a message stating there are zero tasks.
export function isEmpty(tasks: Task[]): boolean {
  return tasks.length === 0;
}

// Pure derived-data logic for the kanban page (task 4.1, design.md
// "kanban/index.vue (ページオーケストレーション)" State Management model,
// Requirements 1.1-1.3, 2.1-2.3, 3.1/3.6, 4.1-4.4, 5.4/5.5). Extracted from
// the .vue SFC so it can be unit-tested without mounting a component (this
// repo has no @vue/test-utils / DOM test environment configured, see
// frontend/vitest.config.ts) — same pattern as
// frontend/components/kanban/TeamWorkloadSummary.helpers.ts.
import type { TaskProgress } from "~/components/kanban/TaskCard.helpers";
import type { WorkloadCount } from "~/components/kanban/TeamWorkloadSummary.helpers";

// Requirement 4.1/4.2/4.3: the single assignee-filter predicate that drives
// both the focus tray (Requirement 1) and the development-stage board
// (Requirement 4). `selectedAssigneeUserId === ""` is the "すべて" default
// (AssigneeFilter.vue's convention) and matches every task.
export function matchesAssigneeFilter(task: Task, selectedAssigneeUserId: string): boolean {
  if (selectedAssigneeUserId === "") {
    return true;
  }
  return task.assigneeUserId === selectedAssigneeUserId;
}

// Requirement 1.2/1.3: the selected assignee's incomplete tasks, regardless
// of whether a development stage is set. Requirement 1.1: while "すべて" is
// selected there is no single focus target, so this is empty.
export function computeFocusedTasks(tasks: Task[], selectedAssigneeUserId: string): Task[] {
  if (selectedAssigneeUserId === "") {
    return [];
  }
  return tasks.filter((task) => task.assigneeUserId === selectedAssigneeUserId && task.status !== "done");
}

// Requirement 2.1/2.2/2.3: per-assignee counts of incomplete tasks that have
// a development stage set, sorted descending by count. Tasks without an
// assignee are excluded (a workload count needs an assignee to attach to).
// design.md: this is NOT filtered by the assignee-filter selection — it
// always reflects every assignee.
export function computeWorkloadCounts(tasks: Task[], users: User[]): WorkloadCount[] {
  const countByUserId = new Map<string, number>();
  for (const task of tasks) {
    if (!task.developmentStageId || task.status === "done" || !task.assigneeUserId) {
      continue;
    }
    countByUserId.set(task.assigneeUserId, (countByUserId.get(task.assigneeUserId) ?? 0) + 1);
  }

  const counts: WorkloadCount[] = [];
  for (const [userId, count] of countByUserId) {
    const user = users.find((candidate) => candidate.id === userId);
    if (!user) {
      continue;
    }
    counts.push({ user, count });
  }

  return counts.sort((a, b) => b.count - a.count);
}

// Requirement 3.1/3.6: tasks with no development stage set. An empty input
// naturally yields an empty result, which the caller renders as "0件".
export function computeBacklogTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => !task.developmentStageId);
}

// Requirement 5.4/5.5: completed/total child-task counts per parent task,
// built from the flat task list's parentTaskId relationships. Only parents
// that actually have at least one child get an entry — a parent with zero
// children must be absent (not `{ completed: 0, total: 0 }`) so the caller
// can decide whether to pass a `progress` prop to TaskCard at all.
export function computeTaskProgressById(tasks: Task[]): Map<string, TaskProgress> {
  const progressByParentId = new Map<string, TaskProgress>();
  for (const task of tasks) {
    if (!task.parentTaskId) {
      continue;
    }
    const existing = progressByParentId.get(task.parentTaskId) ?? { completed: 0, total: 0 };
    existing.total += 1;
    if (task.status === "done") {
      existing.completed += 1;
    }
    progressByParentId.set(task.parentTaskId, existing);
  }
  return progressByParentId;
}

// Requirement 4.2/4.3: the development-stage board's per-stage task list,
// limited to the selected assignee's tasks ("すべて" leaves every assignee
// visible, per matchesAssigneeFilter).
export function computeTasksForStage(tasks: Task[], stageId: string, selectedAssigneeUserId: string): Task[] {
  return tasks.filter(
    (task) => task.developmentStageId === stageId && matchesAssigneeFilter(task, selectedAssigneeUserId),
  );
}

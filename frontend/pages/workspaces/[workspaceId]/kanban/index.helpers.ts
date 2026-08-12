// Pure derived-data logic for the kanban page (task-status-model 5.4,
// design.md "kanban/index.helpers.ts", Requirements 8.6-8.9; also carries
// prior kanban-ux Requirements 1.1-1.3, 2.1-2.3, 3.1/3.6, 4.1-4.4).
// Extracted from the .vue SFC so it can be unit-tested without mounting a
// component (this repo has no @vue/test-utils / DOM test environment
// configured historically — see frontend/vitest.config.ts) — same pattern as
// frontend/components/kanban/TeamWorkloadSummary.helpers.ts.
//
// Runtime import of useTaskClosure uses a relative path: vitest has no `~/`
// alias resolution (only Nuxt does at build/dev time).
import {
  isTaskClosed,
  isTaskCompleted,
  resolveTaskClosureState,
} from "../../../../composables/useTaskClosure";
import type { DevelopmentStage } from "../../../../composables/useApiClient";
import type { WorkloadCount } from "~/components/kanban/TeamWorkloadSummary.helpers";

// Child-task progress for a parent: completed-stage children over the
// non-cancelled denominator, plus how many cancelled children were excluded
// so the card can annotate "中止 N 件を除く" (Requirements 8.6, 8.9; task 5.5).
export interface KanbanTaskProgress {
  completed: number;
  total: number;
  excludedCancelled: number;
}

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

// Requirement 1.2/1.3 + 8.7/8.8: the selected assignee's non-closed tasks,
// regardless of whether a development stage is set. Requirement 1.1: while
// "すべて" is selected there is no single focus target, so this is empty.
export function computeFocusedTasks(
  tasks: Task[],
  selectedAssigneeUserId: string,
  stages: readonly DevelopmentStage[],
): Task[] {
  if (selectedAssigneeUserId === "") {
    return [];
  }
  return tasks.filter(
    (task) =>
      task.assigneeUserId === selectedAssigneeUserId && !isTaskClosed(task, stages),
  );
}

// Requirement 2.1/2.2/2.3 + 8.7/8.8: per-assignee counts of non-closed tasks
// that have a development stage set, sorted descending by count. Tasks
// without an assignee are excluded (a workload count needs an assignee to
// attach to). design.md: this is NOT filtered by the assignee-filter
// selection — it always reflects every assignee.
export function computeWorkloadCounts(
  tasks: Task[],
  users: User[],
  stages: readonly DevelopmentStage[],
): WorkloadCount[] {
  const countByUserId = new Map<string, number>();
  for (const task of tasks) {
    if (!task.developmentStageId || !task.assigneeUserId || isTaskClosed(task, stages)) {
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

// Requirement 8.6/8.8/8.9: completed/total child-task counts per parent,
// built from the flat task list's parentTaskId relationships. Completed =
// completed-stage children; cancelled-stage children are excluded from the
// denominator and reported via excludedCancelled. Only parents with a
// positive non-cancelled denominator get an entry — mother 0 (all children
// cancelled) and parents with zero children must be absent so the caller
// can omit the progress prop entirely.
export function computeTaskProgressById(
  tasks: Task[],
  stages: readonly DevelopmentStage[],
): Map<string, KanbanTaskProgress> {
  const progressByParentId = new Map<string, KanbanTaskProgress>();
  for (const task of tasks) {
    if (!task.parentTaskId) {
      continue;
    }
    const existing = progressByParentId.get(task.parentTaskId) ?? {
      completed: 0,
      total: 0,
      excludedCancelled: 0,
    };
    const closure = resolveTaskClosureState(task, stages);
    if (closure === "cancelled") {
      existing.excludedCancelled += 1;
    } else {
      existing.total += 1;
      if (isTaskCompleted(task, stages)) {
        existing.completed += 1;
      }
    }
    progressByParentId.set(task.parentTaskId, existing);
  }

  for (const [parentId, progress] of progressByParentId) {
    if (progress.total === 0) {
      progressByParentId.delete(parentId);
    }
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

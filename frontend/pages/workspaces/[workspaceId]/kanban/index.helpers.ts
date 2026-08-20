
import {
  isTaskClosed,
  isTaskCompleted,
  resolveTaskClosureState,
} from "../../../../composables/useTaskClosure";
import type { DevelopmentStage } from "../../../../composables/useApiClient";
import type { WorkloadCount } from "~/components/kanban/TeamWorkloadSummary.helpers";

export interface KanbanTaskProgress {
  completed: number;
  total: number;
  excludedCancelled: number;
}

export function matchesAssigneeFilter(task: Task, selectedAssigneeUserId: string): boolean {
  if (selectedAssigneeUserId === "") {
    return true;
  }
  return task.assigneeUserId === selectedAssigneeUserId;
}

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

export function computeBacklogTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => !task.developmentStageId);
}

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

export function computeTasksForStage(tasks: Task[], stageId: string, selectedAssigneeUserId: string): Task[] {
  return tasks.filter(
    (task) => task.developmentStageId === stageId && matchesAssigneeFilter(task, selectedAssigneeUserId),
  );
}

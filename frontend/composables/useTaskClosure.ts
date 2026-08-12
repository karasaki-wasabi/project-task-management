// Client-side task closure predicates (task-status-model 4.3; design.md useTaskClosure).
// Authority stays on the server; these pure helpers exist only for display control.
// Semantics match backend task.closure.resolveClosureState:
// completed/cancelled => closed; only completed => completed; unset/unknown => open.
import type { DevelopmentStage, Task } from "./useApiClient";

export type TaskClosureState = "open" | "completed" | "cancelled";

export function resolveTaskClosureState(
  task: Pick<Task, "developmentStageId">,
  stages: readonly DevelopmentStage[],
): TaskClosureState {
  const stageId = task.developmentStageId;
  if (stageId == null) {
    return "open";
  }

  const stage = stages.find((entry) => entry.id === stageId);
  if (!stage) {
    return "open";
  }

  if (stage.kind === "completed") {
    return "completed";
  }
  if (stage.kind === "cancelled") {
    return "cancelled";
  }
  return "open";
}

export function isTaskClosed(
  task: Pick<Task, "developmentStageId">,
  stages: readonly DevelopmentStage[],
): boolean {
  const state = resolveTaskClosureState(task, stages);
  return state === "completed" || state === "cancelled";
}

export function isTaskCompleted(
  task: Pick<Task, "developmentStageId">,
  stages: readonly DevelopmentStage[],
): boolean {
  return resolveTaskClosureState(task, stages) === "completed";
}

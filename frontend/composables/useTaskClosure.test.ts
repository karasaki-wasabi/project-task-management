// task-status-model 4.3 — client-side closure predicates (Requirements 8.4, 8.5).
import { describe, expect, it } from "vitest";
import type { DevelopmentStage, Task } from "./useApiClient";
import {
  isTaskClosed,
  isTaskCompleted,
  resolveTaskClosureState,
} from "./useTaskClosure";

const stages: readonly DevelopmentStage[] = [
  { id: "stage-normal", name: "作業中", order: 1, kind: "normal" },
  { id: "stage-completed", name: "完了", order: 2, kind: "completed" },
  { id: "stage-cancelled", name: "中止", order: 3, kind: "cancelled" },
];

function taskWithStage(
  developmentStageId: Task["developmentStageId"],
): Pick<Task, "developmentStageId"> {
  return { developmentStageId };
}

describe("resolveTaskClosureState (task-status-model 4.3)", () => {
  it("treats unset developmentStageId as open (Requirement 8.4)", () => {
    expect(resolveTaskClosureState(taskWithStage(null), stages)).toBe("open");
    expect(resolveTaskClosureState(taskWithStage(undefined), stages)).toBe(
      "open",
    );
  });

  it("treats unknown stage ids as open (Requirement 8.4)", () => {
    expect(
      resolveTaskClosureState(taskWithStage("stage-missing"), stages),
    ).toBe("open");
  });

  it("maps known stage kinds to closure states matching backend semantics", () => {
    expect(
      resolveTaskClosureState(taskWithStage("stage-normal"), stages),
    ).toBe("open");
    expect(
      resolveTaskClosureState(taskWithStage("stage-completed"), stages),
    ).toBe("completed");
    expect(
      resolveTaskClosureState(taskWithStage("stage-cancelled"), stages),
    ).toBe("cancelled");
  });
});

describe("isTaskClosed / isTaskCompleted (task-status-model 4.3)", () => {
  it("treats completed and cancelled as closed, and only completed as completed", () => {
    expect(isTaskClosed(taskWithStage("stage-completed"), stages)).toBe(true);
    expect(isTaskCompleted(taskWithStage("stage-completed"), stages)).toBe(
      true,
    );

    expect(isTaskClosed(taskWithStage("stage-cancelled"), stages)).toBe(true);
    expect(isTaskCompleted(taskWithStage("stage-cancelled"), stages)).toBe(
      false,
    );

    expect(isTaskClosed(taskWithStage("stage-normal"), stages)).toBe(false);
    expect(isTaskCompleted(taskWithStage("stage-normal"), stages)).toBe(false);
  });

  it("treats unset and unknown stages as not closed and not completed", () => {
    expect(isTaskClosed(taskWithStage(null), stages)).toBe(false);
    expect(isTaskCompleted(taskWithStage(null), stages)).toBe(false);

    expect(isTaskClosed(taskWithStage("stage-missing"), stages)).toBe(false);
    expect(isTaskCompleted(taskWithStage("stage-missing"), stages)).toBe(
      false,
    );
  });
});

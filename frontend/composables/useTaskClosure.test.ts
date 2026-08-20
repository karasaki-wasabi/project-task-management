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
  it("設定されていない developmentStageId は「open」として扱う (Requirement 8.4)", () => {
    expect(resolveTaskClosureState(taskWithStage(null), stages)).toBe("open");
    expect(resolveTaskClosureState(taskWithStage(undefined), stages)).toBe(
      "open",
    );
  });

  it("不明な developmentStageId は「open」として扱う (Requirement 8.4)", () => {
    expect(
      resolveTaskClosureState(taskWithStage("stage-missing"), stages),
    ).toBe("open");
  });

  it("既知の developmentStageId は backend のセマンティクスに一致する閉じ状態にマップ", () => {
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
  it("完了と中止は閉じ、完了のみ完了として扱う", () => {
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

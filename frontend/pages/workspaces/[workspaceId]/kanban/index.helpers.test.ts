import { describe, expect, it } from "vitest";
import type { DevelopmentStage } from "../../../../composables/useApiClient";
import {
  computeBacklogTasks,
  computeFocusedTasks,
  computeTaskProgressById,
  computeTasksForStage,
  computeWorkloadCounts,
  matchesAssigneeFilter,
} from "./index.helpers";

function makeUser(id: string, name: string): User {
  return { id, name, createdAt: "", updatedAt: "" };
}

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: `task-${overrides.id}`,
    status: "not_started",
    priority: "medium",
    isRequiredForCase: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

const alice = makeUser("u-alice", "Alice");
const bob = makeUser("u-bob", "Bob");

const stages: readonly DevelopmentStage[] = [
  { id: "stage-normal", name: "作業中", order: 1, kind: "normal" },
  { id: "stage-completed", name: "完了", order: 2, kind: "completed" },
  { id: "stage-cancelled", name: "中止", order: 3, kind: "cancelled" },
];

describe("matchesAssigneeFilter (Requirement 4.1/4.2/4.3)", () => {
  it("すべてのタスクにマッチ", () => {
    const task = makeTask({ id: "t1", assigneeUserId: "u-alice" });
    expect(matchesAssigneeFilter(task, "")).toBe(true);
    const unassigned = makeTask({ id: "t2", assigneeUserId: null });
    expect(matchesAssigneeFilter(unassigned, "")).toBe(true);
  });

  it("選択した担当者のタスクにマッチ", () => {
    const aliceTask = makeTask({ id: "t1", assigneeUserId: "u-alice" });
    const bobTask = makeTask({ id: "t2", assigneeUserId: "u-bob" });
    expect(matchesAssigneeFilter(aliceTask, "u-alice")).toBe(true);
    expect(matchesAssigneeFilter(bobTask, "u-alice")).toBe(false);
  });

  it("未割り当てのタスクは特定の担当者にマッチしない", () => {
    const task = makeTask({ id: "t1", assigneeUserId: null });
    expect(matchesAssigneeFilter(task, "u-alice")).toBe(false);
  });
});

describe("フォーカスされたタスクを計算 (Requirements 1.1-1.3, 8.7, 8.8)", () => {
  it("すべてが選択されている場合、空の配列を返す", () => {
    const tasks = [makeTask({ id: "t1", assigneeUserId: "u-alice", status: "in_progress" })];
    expect(computeFocusedTasks(tasks, "", stages)).toEqual([]);
  });

  it("選択した担当者の進行中のタスクを返す", () => {
    const withStage = makeTask({
      id: "t1",
      assigneeUserId: "u-alice",
      status: "in_progress",
      developmentStageId: "stage-normal",
    });
    const withoutStage = makeTask({
      id: "t2",
      assigneeUserId: "u-alice",
      status: "not_started",
      developmentStageId: null,
    });
    const otherAssignee = makeTask({ id: "t3", assigneeUserId: "u-bob", status: "in_progress" });
    const result = computeFocusedTasks([withStage, withoutStage, otherAssignee], "u-alice", stages);
    expect(result).toEqual([withStage, withoutStage]);
  });

  it("完了または中止のステージのタスクを除外 (Requirement 8.7, 8.8)", () => {
    const completed = makeTask({
      id: "t1",
      assigneeUserId: "u-alice",
      developmentStageId: "stage-completed",
      status: "not_started",
    });
    const cancelled = makeTask({
      id: "t2",
      assigneeUserId: "u-alice",
      developmentStageId: "stage-cancelled",
      status: "not_started",
    });
    const openHandoff = makeTask({
      id: "t3",
      assigneeUserId: "u-alice",
      developmentStageId: "stage-normal",
      status: "ready_for_handoff",
    });
    const openInProgress = makeTask({
      id: "t4",
      assigneeUserId: "u-alice",
      developmentStageId: "stage-normal",
      status: "in_progress",
    });
    const result = computeFocusedTasks(
      [completed, cancelled, openHandoff, openInProgress],
      "u-alice",
      stages,
    );
    expect(result).toEqual([openHandoff, openInProgress]);
  });

  it("選択した担当者が完了または中止のステージのタスクしか持たない場合、空の配列を返す", () => {
    const completed = makeTask({
      id: "t1",
      assigneeUserId: "u-alice",
      developmentStageId: "stage-completed",
    });
    expect(computeFocusedTasks([completed], "u-alice", stages)).toEqual([]);
  });
});

describe("担当者の負荷を計算 (Requirements 2.1-2.3, 8.7, 8.8)", () => {
  it("担当者ごとに開発ステージが設定された進行中のタスクをカウント", () => {
    const tasks = [
      makeTask({
        id: "t1",
        assigneeUserId: "u-alice",
        developmentStageId: "stage-normal",
        status: "in_progress",
      }),
      makeTask({
        id: "t2",
        assigneeUserId: "u-alice",
        developmentStageId: "stage-normal",
        status: "not_started",
      }),
      makeTask({
        id: "t3",
        assigneeUserId: "u-bob",
        developmentStageId: "stage-normal",
        status: "in_progress",
      }),
    ];
    const result = computeWorkloadCounts(tasks, [alice, bob], stages);
    expect(result).toEqual([
      { user: alice, count: 2 },
      { user: bob, count: 1 },
    ]);
  });

  it("開発ステージが設定されていないタスクを除外", () => {
    const tasks = [
      makeTask({ id: "t1", assigneeUserId: "u-alice", developmentStageId: null, status: "in_progress" }),
    ];
    expect(computeWorkloadCounts(tasks, [alice], stages)).toEqual([]);
  });

  it("開発ステージが設定されている場合でも、完了または中止のステージのタスクを除外 (Requirement 8.7)", () => {
    const tasks = [
      makeTask({
        id: "t1",
        assigneeUserId: "u-alice",
        developmentStageId: "stage-completed",
        status: "not_started",
      }),
      makeTask({
        id: "t2",
        assigneeUserId: "u-alice",
        developmentStageId: "stage-cancelled",
        status: "not_started",
      }),
    ];
    expect(computeWorkloadCounts(tasks, [alice], stages)).toEqual([]);
  });

  it("進行中のステージで、ハンドオフ準備完了のタスクを含む (Requirement 8.8)", () => {
    const tasks = [
      makeTask({
        id: "t1",
        assigneeUserId: "u-alice",
        developmentStageId: "stage-normal",
        status: "ready_for_handoff",
      }),
    ];
    expect(computeWorkloadCounts(tasks, [alice], stages)).toEqual([{ user: alice, count: 1 }]);
  });

  it("担当者が未割り当てのタスクを除外", () => {
    const tasks = [
      makeTask({
        id: "t1",
        assigneeUserId: null,
        developmentStageId: "stage-normal",
        status: "in_progress",
      }),
    ];
    expect(computeWorkloadCounts(tasks, [alice], stages)).toEqual([]);
  });

  it("担当者フィルタの選択に影響を受けない (常にすべての担当者)", () => {
    const tasks = [
      makeTask({
        id: "t1",
        assigneeUserId: "u-alice",
        developmentStageId: "stage-normal",
        status: "in_progress",
      }),
      makeTask({
        id: "t2",
        assigneeUserId: "u-bob",
        developmentStageId: "stage-normal",
        status: "in_progress",
      }),
    ];
    const result = computeWorkloadCounts(tasks, [alice, bob], stages);
    expect(result).toHaveLength(2);
  });

  it("元の順序を保持 (安定ソート)", () => {
    const tasks = [
      makeTask({
        id: "t1",
        assigneeUserId: "u-bob",
        developmentStageId: "stage-normal",
        status: "in_progress",
      }),
      makeTask({
        id: "t2",
        assigneeUserId: "u-alice",
        developmentStageId: "stage-normal",
        status: "in_progress",
      }),
    ];
    const result = computeWorkloadCounts(tasks, [alice, bob], stages);
    expect(result).toEqual([
      { user: bob, count: 1 },
      { user: alice, count: 1 },
    ]);
  });

  it("空の入力の場合、空の配列を返す", () => {
    expect(computeWorkloadCounts([], [], stages)).toEqual([]);
  });
});

describe("バックログのタスクを計算 (Requirement 3.1/3.6)", () => {
  it("開発ステージが設定されていないタスクを返す", () => {
    const withStage = makeTask({ id: "t1", developmentStageId: "s1" });
    const withoutStage = makeTask({ id: "t2", developmentStageId: null });
    const withUndefinedStage = makeTask({ id: "t3" });
    expect(computeBacklogTasks([withStage, withoutStage, withUndefinedStage])).toEqual([
      withoutStage,
      withUndefinedStage,
    ]);
  });

  it("未割り当てのステージのタスクがない場合、空の配列を返す", () => {
    expect(computeBacklogTasks([])).toEqual([]);
  });
});

describe("親タスクの進捗を計算 (Requirements 8.6, 8.8, 8.9)", () => {
  it("完了したステージの子タスクを非中止の子タスクで除算 (observable: 1 of 2 with 1 cancelled)", () => {
    const parent = makeTask({ id: "parent", developmentStageId: "stage-normal" });
    const completedChild = makeTask({
      id: "c1",
      parentTaskId: "parent",
      developmentStageId: "stage-completed",
      status: "not_started",
    });
    const cancelledChild = makeTask({
      id: "c2",
      parentTaskId: "parent",
      developmentStageId: "stage-cancelled",
      status: "not_started",
    });
    const openChild = makeTask({
      id: "c3",
      parentTaskId: "parent",
      developmentStageId: "stage-normal",
      status: "in_progress",
    });
    const result = computeTaskProgressById(
      [parent, completedChild, cancelledChild, openChild],
      stages,
    );
    expect(result.get("parent")).toEqual({
      completed: 1,
      total: 2,
      excludedCancelled: 1,
    });
  });

  it("ハンドオフ準備完了のタスクを完了としてカウントしない (Requirement 8.8)", () => {
    const child = makeTask({
      id: "c1",
      parentTaskId: "parent",
      developmentStageId: "stage-normal",
      status: "ready_for_handoff",
    });
    const result = computeTaskProgressById([child], stages);
    expect(result.get("parent")).toEqual({
      completed: 0,
      total: 1,
      excludedCancelled: 0,
    });
  });

  it("非中止の子タスクを除外した後、分母が0の場合、進捗を除外 (Requirement 8.9)", () => {
    const cancelledOnly = makeTask({
      id: "c1",
      parentTaskId: "parent",
      developmentStageId: "stage-cancelled",
    });
    const result = computeTaskProgressById([cancelledOnly], stages);
    expect(result.has("parent")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("子タスクが0のタスクは進捗に含まれない", () => {
    const lonely = makeTask({ id: "lonely" });
    const result = computeTaskProgressById([lonely], stages);
    expect(result.has("lonely")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("複数の親タスクを独立して処理", () => {
    const childA1 = makeTask({
      id: "a1",
      parentTaskId: "parentA",
      developmentStageId: "stage-completed",
    });
    const childA2 = makeTask({
      id: "a2",
      parentTaskId: "parentA",
      developmentStageId: "stage-completed",
    });
    const childB1 = makeTask({
      id: "b1",
      parentTaskId: "parentB",
      developmentStageId: "stage-normal",
    });
    const result = computeTaskProgressById([childA1, childA2, childB1], stages);
    expect(result.get("parentA")).toEqual({
      completed: 2,
      total: 2,
      excludedCancelled: 0,
    });
    expect(result.get("parentB")).toEqual({
      completed: 0,
      total: 1,
      excludedCancelled: 0,
    });
  });

  it("空の入力の場合、空のマップを返す", () => {
    expect(computeTaskProgressById([], stages).size).toBe(0);
  });

  it("親タスクIDが設定されていないタスクがない場合、空のマップを返す", () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2", parentTaskId: null })];
    expect(computeTaskProgressById(tasks, stages).size).toBe(0);
  });
});

describe("ステージのタスクを計算 (Requirement 4.2/4.3)", () => {
  it("すべての担当者のタスクをステージに含む", () => {
    const t1 = makeTask({ id: "t1", developmentStageId: "s1", assigneeUserId: "u-alice" });
    const t2 = makeTask({ id: "t2", developmentStageId: "s1", assigneeUserId: "u-bob" });
    const other = makeTask({ id: "t3", developmentStageId: "s2", assigneeUserId: "u-alice" });
    expect(computeTasksForStage([t1, t2, other], "s1", "")).toEqual([t1, t2]);
  });

  it("ステージのタスクを選択した担当者に限定", () => {
    const t1 = makeTask({ id: "t1", developmentStageId: "s1", assigneeUserId: "u-alice" });
    const t2 = makeTask({ id: "t2", developmentStageId: "s1", assigneeUserId: "u-bob" });
    expect(computeTasksForStage([t1, t2], "s1", "u-alice")).toEqual([t1]);
  });

  it("ステージのタスクが選択した担当者に属していない場合、空の配列を返す", () => {
    const t1 = makeTask({ id: "t1", developmentStageId: "s1", assigneeUserId: "u-bob" });
    expect(computeTasksForStage([t1], "s1", "u-alice")).toEqual([]);
  });
});

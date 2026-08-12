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
  it("matches every task when selectedAssigneeUserId is empty (すべて)", () => {
    const task = makeTask({ id: "t1", assigneeUserId: "u-alice" });
    expect(matchesAssigneeFilter(task, "")).toBe(true);
    const unassigned = makeTask({ id: "t2", assigneeUserId: null });
    expect(matchesAssigneeFilter(unassigned, "")).toBe(true);
  });

  it("matches only the task belonging to the selected assignee", () => {
    const aliceTask = makeTask({ id: "t1", assigneeUserId: "u-alice" });
    const bobTask = makeTask({ id: "t2", assigneeUserId: "u-bob" });
    expect(matchesAssigneeFilter(aliceTask, "u-alice")).toBe(true);
    expect(matchesAssigneeFilter(bobTask, "u-alice")).toBe(false);
  });

  it("does not match an unassigned task against a specific assignee", () => {
    const task = makeTask({ id: "t1", assigneeUserId: null });
    expect(matchesAssigneeFilter(task, "u-alice")).toBe(false);
  });
});

describe("computeFocusedTasks (Requirements 1.1-1.3, 8.7, 8.8)", () => {
  it("returns an empty array when すべて (empty string) is selected", () => {
    const tasks = [makeTask({ id: "t1", assigneeUserId: "u-alice", status: "in_progress" })];
    expect(computeFocusedTasks(tasks, "", stages)).toEqual([]);
  });

  it("returns the selected assignee's open tasks regardless of development stage", () => {
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

  it("excludes closed tasks (completed or cancelled stage), not by status (Requirement 8.7, 8.8)", () => {
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

  it("returns an empty array when the selected assignee has only closed tasks", () => {
    const completed = makeTask({
      id: "t1",
      assigneeUserId: "u-alice",
      developmentStageId: "stage-completed",
    });
    expect(computeFocusedTasks([completed], "u-alice", stages)).toEqual([]);
  });
});

describe("computeWorkloadCounts (Requirements 2.1-2.3, 8.7, 8.8)", () => {
  it("counts open tasks with a development stage per assignee, descending", () => {
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

  it("excludes tasks without a development stage", () => {
    const tasks = [
      makeTask({ id: "t1", assigneeUserId: "u-alice", developmentStageId: null, status: "in_progress" }),
    ];
    expect(computeWorkloadCounts(tasks, [alice], stages)).toEqual([]);
  });

  it("excludes closed tasks even when a development stage is set (Requirement 8.7)", () => {
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

  it("includes ready_for_handoff tasks on open stages (Requirement 8.8: not status-based)", () => {
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

  it("excludes tasks without an assignee", () => {
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

  it("is not affected by any assignee filter selection (always all assignees)", () => {
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

  it("keeps ties in original encounter order (stable sort)", () => {
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

  it("returns an empty array for empty input", () => {
    expect(computeWorkloadCounts([], [], stages)).toEqual([]);
  });
});

describe("computeBacklogTasks (Requirement 3.1/3.6)", () => {
  it("returns tasks with no development stage set", () => {
    const withStage = makeTask({ id: "t1", developmentStageId: "s1" });
    const withoutStage = makeTask({ id: "t2", developmentStageId: null });
    const withUndefinedStage = makeTask({ id: "t3" });
    expect(computeBacklogTasks([withStage, withoutStage, withUndefinedStage])).toEqual([
      withoutStage,
      withUndefinedStage,
    ]);
  });

  it("returns an empty array when there are no unassigned-stage tasks", () => {
    expect(computeBacklogTasks([])).toEqual([]);
  });
});

describe("computeTaskProgressById (Requirements 8.6, 8.8, 8.9)", () => {
  it("counts completed-stage children over non-cancelled children (observable: 1 of 2 with 1 cancelled)", () => {
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

  it("does not count ready_for_handoff as completed (Requirement 8.8)", () => {
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

  it("omits progress when the denominator is 0 after excluding cancelled children (Requirement 8.9)", () => {
    const cancelledOnly = makeTask({
      id: "c1",
      parentTaskId: "parent",
      developmentStageId: "stage-cancelled",
    });
    const result = computeTaskProgressById([cancelledOnly], stages);
    expect(result.has("parent")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("has no entry for a task with zero children", () => {
    const lonely = makeTask({ id: "lonely" });
    const result = computeTaskProgressById([lonely], stages);
    expect(result.has("lonely")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("handles multiple parents independently", () => {
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

  it("returns an empty map for an empty input", () => {
    expect(computeTaskProgressById([], stages).size).toBe(0);
  });

  it("returns an empty map when no task has a parentTaskId", () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2", parentTaskId: null })];
    expect(computeTaskProgressById(tasks, stages).size).toBe(0);
  });
});

describe("computeTasksForStage (Requirement 4.2/4.3)", () => {
  it("returns all assignees' tasks for the stage when すべて is selected", () => {
    const t1 = makeTask({ id: "t1", developmentStageId: "s1", assigneeUserId: "u-alice" });
    const t2 = makeTask({ id: "t2", developmentStageId: "s1", assigneeUserId: "u-bob" });
    const other = makeTask({ id: "t3", developmentStageId: "s2", assigneeUserId: "u-alice" });
    expect(computeTasksForStage([t1, t2, other], "s1", "")).toEqual([t1, t2]);
  });

  it("limits the stage's tasks to the selected assignee", () => {
    const t1 = makeTask({ id: "t1", developmentStageId: "s1", assigneeUserId: "u-alice" });
    const t2 = makeTask({ id: "t2", developmentStageId: "s1", assigneeUserId: "u-bob" });
    expect(computeTasksForStage([t1, t2], "s1", "u-alice")).toEqual([t1]);
  });

  it("returns an empty array when no task in the stage belongs to the selected assignee", () => {
    const t1 = makeTask({ id: "t1", developmentStageId: "s1", assigneeUserId: "u-bob" });
    expect(computeTasksForStage([t1], "s1", "u-alice")).toEqual([]);
  });
});

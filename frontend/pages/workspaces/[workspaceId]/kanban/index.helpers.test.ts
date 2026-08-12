import { describe, expect, it } from "vitest";
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

describe("computeFocusedTasks (Requirement 1.1-1.3)", () => {
  it("returns an empty array when すべて (empty string) is selected", () => {
    const tasks = [makeTask({ id: "t1", assigneeUserId: "u-alice", status: "in_progress" })];
    expect(computeFocusedTasks(tasks, "")).toEqual([]);
  });

  it("returns the selected assignee's incomplete tasks regardless of development stage", () => {
    const withStage = makeTask({ id: "t1", assigneeUserId: "u-alice", status: "in_progress", developmentStageId: "s1" });
    const withoutStage = makeTask({ id: "t2", assigneeUserId: "u-alice", status: "not_started", developmentStageId: null });
    const otherAssignee = makeTask({ id: "t3", assigneeUserId: "u-bob", status: "in_progress" });
    const result = computeFocusedTasks([withStage, withoutStage, otherAssignee], "u-alice");
    expect(result).toEqual([withStage, withoutStage]);
  });

  it("excludes ready_for_handoff tasks for the selected assignee", () => {
    const handoff = makeTask({ id: "t1", assigneeUserId: "u-alice", status: "ready_for_handoff" });
    const notHandoff = makeTask({ id: "t2", assigneeUserId: "u-alice", status: "in_progress" });
    const result = computeFocusedTasks([handoff, notHandoff], "u-alice");
    expect(result).toEqual([notHandoff]);
  });

  it("returns an empty array when the selected assignee has no incomplete tasks", () => {
    const handoff = makeTask({ id: "t1", assigneeUserId: "u-alice", status: "ready_for_handoff" });
    expect(computeFocusedTasks([handoff], "u-alice")).toEqual([]);
  });
});

describe("computeWorkloadCounts (Requirement 2.1-2.3)", () => {
  it("counts incomplete tasks with a development stage per assignee, descending", () => {
    const tasks = [
      makeTask({ id: "t1", assigneeUserId: "u-alice", developmentStageId: "s1", status: "in_progress" }),
      makeTask({ id: "t2", assigneeUserId: "u-alice", developmentStageId: "s2", status: "not_started" }),
      makeTask({ id: "t3", assigneeUserId: "u-bob", developmentStageId: "s1", status: "in_progress" }),
    ];
    const result = computeWorkloadCounts(tasks, [alice, bob]);
    expect(result).toEqual([
      { user: alice, count: 2 },
      { user: bob, count: 1 },
    ]);
  });

  it("excludes tasks without a development stage", () => {
    const tasks = [makeTask({ id: "t1", assigneeUserId: "u-alice", developmentStageId: null, status: "in_progress" })];
    expect(computeWorkloadCounts(tasks, [alice])).toEqual([]);
  });

  it("excludes ready_for_handoff tasks even when a development stage is set", () => {
    const tasks = [
      makeTask({ id: "t1", assigneeUserId: "u-alice", developmentStageId: "s1", status: "ready_for_handoff" }),
    ];
    expect(computeWorkloadCounts(tasks, [alice])).toEqual([]);
  });

  it("excludes tasks without an assignee", () => {
    const tasks = [makeTask({ id: "t1", assigneeUserId: null, developmentStageId: "s1", status: "in_progress" })];
    expect(computeWorkloadCounts(tasks, [alice])).toEqual([]);
  });

  it("is not affected by any assignee filter selection (always all assignees)", () => {
    const tasks = [
      makeTask({ id: "t1", assigneeUserId: "u-alice", developmentStageId: "s1", status: "in_progress" }),
      makeTask({ id: "t2", assigneeUserId: "u-bob", developmentStageId: "s1", status: "in_progress" }),
    ];
    const result = computeWorkloadCounts(tasks, [alice, bob]);
    expect(result).toHaveLength(2);
  });

  it("keeps ties in original encounter order (stable sort)", () => {
    const tasks = [
      makeTask({ id: "t1", assigneeUserId: "u-bob", developmentStageId: "s1", status: "in_progress" }),
      makeTask({ id: "t2", assigneeUserId: "u-alice", developmentStageId: "s1", status: "in_progress" }),
    ];
    const result = computeWorkloadCounts(tasks, [alice, bob]);
    expect(result).toEqual([
      { user: bob, count: 1 },
      { user: alice, count: 1 },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(computeWorkloadCounts([], [])).toEqual([]);
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

describe("computeTaskProgressById (Requirement 5.4/5.5)", () => {
  it("counts completed/total children per parent task", () => {
    const parent = makeTask({ id: "parent" });
    const child1 = makeTask({ id: "c1", parentTaskId: "parent", status: "ready_for_handoff" });
    const child2 = makeTask({ id: "c2", parentTaskId: "parent", status: "in_progress" });
    const result = computeTaskProgressById([parent, child1, child2]);
    expect(result.get("parent")).toEqual({ completed: 1, total: 2 });
  });

  it("has no entry for a task with zero children", () => {
    const lonely = makeTask({ id: "lonely" });
    const result = computeTaskProgressById([lonely]);
    expect(result.has("lonely")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("handles multiple parents independently", () => {
    const childA1 = makeTask({ id: "a1", parentTaskId: "parentA", status: "ready_for_handoff" });
    const childA2 = makeTask({ id: "a2", parentTaskId: "parentA", status: "ready_for_handoff" });
    const childB1 = makeTask({ id: "b1", parentTaskId: "parentB", status: "not_started" });
    const result = computeTaskProgressById([childA1, childA2, childB1]);
    expect(result.get("parentA")).toEqual({ completed: 2, total: 2 });
    expect(result.get("parentB")).toEqual({ completed: 0, total: 1 });
  });

  it("returns an empty map for an empty input", () => {
    expect(computeTaskProgressById([]).size).toBe(0);
  });

  it("returns an empty map when no task has a parentTaskId", () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2", parentTaskId: null })];
    expect(computeTaskProgressById(tasks).size).toBe(0);
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

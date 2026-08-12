// Mount tests for TaskNode stage display / terminal actions / layout
// (task-status-model 5.2, Requirements 4.5, 8.2, 8.10; design.md TaskNode.vue).
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import type { DevelopmentStage, Task } from "../../composables/useApiClient";
import StageBadge from "../shared/StageBadge.vue";
import TaskNode from "./TaskNode.vue";

const PriorityBadgeStub = defineComponent({
  name: "PriorityBadge",
  props: { priority: { type: String, required: true } },
  template: `<span data-testid="priority-badge">{{ priority }}</span>`,
});

const StatusBadgeStub = defineComponent({
  name: "StatusBadge",
  props: { status: { type: String, required: true } },
  template: `<span data-testid="status-badge">{{ status }}</span>`,
});

function makeStage(overrides: Partial<DevelopmentStage> = {}): DevelopmentStage {
  return {
    id: "s-normal",
    name: "作業中",
    order: 1,
    kind: "normal",
    ...overrides,
  };
}

const stages: DevelopmentStage[] = [
  makeStage({ id: "s-normal", name: "作業中", order: 1, kind: "normal" }),
  makeStage({ id: "s-done", name: "完了", order: 2, kind: "completed" }),
  makeStage({ id: "s-cancel", name: "中止", order: 3, kind: "cancelled" }),
];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "サンプルタスク",
    status: "in_progress",
    priority: "medium",
    isRequiredForCase: false,
    developmentStageId: "s-normal",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function mountNode(task: Task, stageList: DevelopmentStage[] = stages) {
  return mount(TaskNode, {
    props: {
      task,
      children: [],
      allTasks: [task],
      stages: stageList,
    },
    global: {
      stubs: {
        PriorityBadge: PriorityBadgeStub,
        StatusBadge: StatusBadgeStub,
      },
      components: {
        StageBadge,
      },
    },
  });
}

describe("TaskNode (task-status-model 5.2)", () => {
  it("shows StageBadge after priority for a normal stage", () => {
    const wrapper = mountNode(makeTask({ developmentStageId: "s-normal" }));
    const row = wrapper.get('[data-testid="task-node-main"]');
    const badges = row.get('[data-testid="task-node-badges"]');
    const texts = badges.findAll("*").map((n) => n.attributes("data-testid") ?? n.text());

    expect(badges.text()).toContain("段階: 作業中");
    const priorityIdx = texts.indexOf("priority-badge");
    const stageIdx = badges
      .findAllComponents(StageBadge)
      .map((c: { element: Element }) => c.element)
      .map((el: Element) => Array.from(badges.element.children).indexOf(el))[0];
    const priorityEl = badges.get('[data-testid="priority-badge"]').element;
    const priorityPos = Array.from(badges.element.children).indexOf(priorityEl);
    expect(stageIdx).toBeGreaterThan(priorityPos);
    expect(priorityIdx).toBeGreaterThanOrEqual(0);
  });

  it("shows unset StageBadge when developmentStageId is null", () => {
    const wrapper = mountNode(makeTask({ developmentStageId: null }));
    expect(wrapper.text()).toContain("段階: 未設定");
  });

  it("hides status badge, status select, and split on completed stage", () => {
    const wrapper = mountNode(
      makeTask({ id: "t-done", title: "完了タスク", developmentStageId: "s-done" }),
    );

    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(false);
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.findAll("button").every((b) => b.text() !== "分割")).toBe(true);
    expect(wrapper.text()).toContain("段階: 完了");
  });

  it("hides status badge, status select, and split on cancelled stage", () => {
    const wrapper = mountNode(
      makeTask({ id: "t-cancel", title: "中止タスク", developmentStageId: "s-cancel" }),
    );

    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(false);
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.findAll("button").every((b) => b.text() !== "分割")).toBe(true);
    expect(wrapper.text()).toContain("段階: 中止");
  });

  it("shows status badge, status select, and split on open stages", () => {
    const wrapper = mountNode(makeTask());

    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(true);
    expect(wrapper.find("select").exists()).toBe(true);
    expect(wrapper.findAll("button").some((b) => b.text() === "分割")).toBe(true);
    const select = wrapper.get("select");
    expect(select.text()).toContain("未着手");
    expect(select.text()).toContain("作業中");
    expect(select.text()).toContain("引継待ち");
    expect(select.text()).toContain("保留");
  });

  it("uses a three-block layout with spacer locking actions to the right", () => {
    const open = mountNode(makeTask({ id: "open", title: "通常" }));
    const closed = mountNode(
      makeTask({ id: "closed", title: "完了", developmentStageId: "s-done" }),
    );

    for (const wrapper of [open, closed]) {
      const main = wrapper.get('[data-testid="task-node-main"]');
      expect(main.classes().join(" ")).toMatch(/flex/);
      expect(main.find('[data-testid="task-node-badges"]').exists()).toBe(true);
      const spacer = main.get('[data-testid="task-node-spacer"]');
      expect(spacer.classes().join(" ")).toContain("flex-1");
      expect(main.find('[data-testid="task-node-actions"]').exists()).toBe(true);
    }

    const openActions = open.get('[data-testid="task-node-actions"]');
    const closedActions = closed.get('[data-testid="task-node-actions"]');
    expect(openActions.element.parentElement).toBe(open.get('[data-testid="task-node-main"]').element);
    expect(closedActions.element.parentElement).toBe(
      closed.get('[data-testid="task-node-main"]').element,
    );
    // Same structural position: actions are the last flex child after spacer.
    const openChildren = Array.from(open.get('[data-testid="task-node-main"]').element.children);
    const closedChildren = Array.from(closed.get('[data-testid="task-node-main"]').element.children);
    expect(openChildren.indexOf(openActions.element)).toBe(openChildren.length - 1);
    expect(closedChildren.indexOf(closedActions.element)).toBe(closedChildren.length - 1);
    expect(openChildren.indexOf(open.get('[data-testid="task-node-spacer"]').element)).toBe(
      openChildren.indexOf(openActions.element) - 1,
    );
    expect(closedChildren.indexOf(closed.get('[data-testid="task-node-spacer"]').element)).toBe(
      closedChildren.indexOf(closedActions.element) - 1,
    );
  });
});

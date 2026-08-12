// Mount tests for TaskCard terminal-column / progress annotation
// (task-status-model 5.5; Requirements 4.5, 8.6, 8.9).
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import type { Task } from "../../composables/useApiClient";
import TaskCard from "./TaskCard.vue";

const StatusBadgeStub = defineComponent({
  name: "StatusBadge",
  props: { status: { type: String, required: true } },
  template: `<span data-testid="status-badge">{{ status }}</span>`,
});

const PriorityBadgeStub = defineComponent({
  name: "PriorityBadge",
  props: { priority: { type: String, required: true } },
  template: `<span data-testid="priority-badge">{{ priority }}</span>`,
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "親タスク",
    status: "in_progress",
    priority: "medium",
    isRequiredForCase: false,
    assigneeUserId: "u1",
    developmentStageId: "s-normal",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function mountCard(
  props: {
    task?: Task;
    assigneeName?: string;
    progress?: { completed: number; total: number; excludedCancelled: number };
    isTerminalColumn?: boolean;
  } = {},
) {
  return mount(TaskCard, {
    props: {
      task: props.task ?? makeTask(),
      assigneeName: props.assigneeName ?? "太郎",
      progress: props.progress,
      isTerminalColumn: props.isTerminalColumn ?? false,
    },
    global: {
      stubs: {
        StatusBadge: StatusBadgeStub,
        PriorityBadge: PriorityBadgeStub,
      },
    },
  });
}

describe("TaskCard (task-status-model 5.5)", () => {
  it("hides StatusBadge on a terminal column", () => {
    const wrapper = mountCard({ isTerminalColumn: true });
    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(false);
  });

  it("shows StatusBadge on a normal column", () => {
    const wrapper = mountCard({ isTerminalColumn: false });
    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(true);
  });

  it("keeps the assignee avatar in the footer row on terminal columns (aligned with normal columns)", () => {
    const normal = mountCard({ isTerminalColumn: false });
    const terminal = mountCard({ isTerminalColumn: true });

    const normalFooter = normal.get('[data-testid="task-card-footer"]');
    const terminalFooter = terminal.get('[data-testid="task-card-footer"]');

    expect(normalFooter.find(".assignee").exists()).toBe(true);
    expect(terminalFooter.find(".assignee").exists()).toBe(true);
    expect(normalFooter.find(".assignee").element.parentElement).toBe(normalFooter.element);
    expect(terminalFooter.find(".assignee").element.parentElement).toBe(terminalFooter.element);
  });

  it("hides progress on a terminal column even when progress is supplied", () => {
    const wrapper = mountCard({
      isTerminalColumn: true,
      progress: { completed: 1, total: 2, excludedCancelled: 1 },
    });
    expect(wrapper.find(".task-progress").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("1/2");
    expect(wrapper.text()).not.toContain("中止");
  });

  it("hides progress when the non-cancelled denominator is 0", () => {
    const wrapper = mountCard({
      progress: { completed: 0, total: 0, excludedCancelled: 2 },
    });
    expect(wrapper.find(".task-progress").exists()).toBe(false);
  });

  it("shows progress and the cancelled-exclusion note when cancelled children were excluded", () => {
    const wrapper = mountCard({
      progress: { completed: 1, total: 2, excludedCancelled: 1 },
    });
    expect(wrapper.find(".task-progress").exists()).toBe(true);
    expect(wrapper.text()).toContain("1/2");
    expect(wrapper.text()).toContain("中止 1 件を除く");
  });

  it("does not show the exclusion note when no cancelled children were excluded", () => {
    const wrapper = mountCard({
      progress: { completed: 1, total: 2, excludedCancelled: 0 },
    });
    expect(wrapper.text()).toContain("1/2");
    expect(wrapper.text()).not.toContain("中止");
  });
});

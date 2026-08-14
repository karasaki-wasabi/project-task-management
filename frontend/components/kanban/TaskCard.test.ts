// Mount tests for TaskCard terminal-column / progress annotation
// (task-status-model 5.5; Requirements 4.5, 8.6, 8.9)
// and UserAvatar assignee display (user-avatar 3.1; Requirements 2.1, 3.1, 4.1).
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import type { Task } from "../../composables/useApiClient";
import UserAvatar from "../shared/UserAvatar.vue";
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
    assigneeId?: string;
    progress?: { completed: number; total: number; excludedCancelled: number };
    isTerminalColumn?: boolean;
  } = {},
) {
  return mount(TaskCard, {
    props: {
      task: props.task ?? makeTask(),
      assigneeName: "assigneeName" in props ? props.assigneeName : "太郎",
      assigneeId: "assigneeId" in props ? props.assigneeId : "u1",
      progress: props.progress,
      isTerminalColumn: props.isTerminalColumn ?? false,
    },
    global: {
      stubs: {
        StatusBadge: StatusBadgeStub,
        PriorityBadge: PriorityBadgeStub,
      },
      components: {
        UserAvatar,
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

    const normalAvatar = normal.getComponent(UserAvatar);
    const terminalAvatar = terminal.getComponent(UserAvatar);

    expect(normalAvatar.element.parentElement?.getAttribute("data-testid")).toBe("task-card-footer");
    expect(terminalAvatar.element.parentElement?.getAttribute("data-testid")).toBe("task-card-footer");
  });

  it("renders UserAvatar with title set to the assignee name", () => {
    const wrapper = mountCard({ assigneeId: "u1", assigneeName: "太郎" });
    const avatar = wrapper.getComponent(UserAvatar);

    expect(avatar.props("userId")).toBe("u1");
    expect(avatar.props("name")).toBe("太郎");
    expect(avatar.props("size")).toBe(24);
    expect(avatar.attributes("title")).toBe("太郎");
    expect(avatar.attributes("aria-label")).toBe("太郎");
    expect(wrapper.find(".assignee").exists()).toBe(false);
    expect(wrapper.find(".bg-primary-100").exists()).toBe(false);
    expect(wrapper.classes()).toContain("card");
    expect(wrapper.attributes("data-task-id")).toBe("t1");
  });

  it("does not render UserAvatar when there is no assignee", () => {
    const wrapper = mountCard({ assigneeId: undefined, assigneeName: undefined });

    expect(wrapper.findComponent(UserAvatar).exists()).toBe(false);
    expect(wrapper.find(".assignee").exists()).toBe(false);
    expect(wrapper.find(".bg-primary-100").exists()).toBe(false);
  });

  it("does not render UserAvatar when assigneeId is missing even if a name is present", () => {
    const wrapper = mountCard({ assigneeId: undefined, assigneeName: "太郎" });

    expect(wrapper.findComponent(UserAvatar).exists()).toBe(false);
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

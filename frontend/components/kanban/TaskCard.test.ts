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
  it("完了・中止の列で StatusBadge を非表示にする", () => {
    const wrapper = mountCard({ isTerminalColumn: true });
    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(false);
  });

  it("通常の列で StatusBadge を表示する", () => {
    const wrapper = mountCard({ isTerminalColumn: false });
    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(true);
  });

  it("完了・中止の列で担当者のアバターをフッター行に表示する（通常の列と揃える）", () => {
    const normal = mountCard({ isTerminalColumn: false });
    const terminal = mountCard({ isTerminalColumn: true });

    const normalAvatar = normal.getComponent(UserAvatar);
    const terminalAvatar = terminal.getComponent(UserAvatar);

    expect(normalAvatar.element.parentElement?.getAttribute("data-testid")).toBe("task-card-footer");
    expect(terminalAvatar.element.parentElement?.getAttribute("data-testid")).toBe("task-card-footer");
  });

  it("担当者の名前をタイトルとして UserAvatar を表示する", () => {
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

  it("担当者が存在しない場合、UserAvatar を表示しない", () => {
    const wrapper = mountCard({ assigneeId: undefined, assigneeName: undefined });

    expect(wrapper.findComponent(UserAvatar).exists()).toBe(false);
    expect(wrapper.find(".assignee").exists()).toBe(false);
    expect(wrapper.find(".bg-primary-100").exists()).toBe(false);
  });

  it("担当者IDが存在しない場合、UserAvatar を表示しない（担当者名が存在する場合）", () => {
    const wrapper = mountCard({ assigneeId: undefined, assigneeName: "太郎" });

    expect(wrapper.findComponent(UserAvatar).exists()).toBe(false);
  });

  it("完了・中止の列で progress が提供されている場合、progress を表示しない", () => {
    const wrapper = mountCard({
      isTerminalColumn: true,
      progress: { completed: 1, total: 2, excludedCancelled: 1 },
    });
    expect(wrapper.find(".task-progress").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("1/2");
    expect(wrapper.text()).not.toContain("中止");
  });

  it("非中止の分母が 0 の場合、progress を表示しない", () => {
    const wrapper = mountCard({
      progress: { completed: 0, total: 0, excludedCancelled: 2 },
    });
    expect(wrapper.find(".task-progress").exists()).toBe(false);
  });

  it("中止されたサブタスクが除外されている場合、progress と除外の理由を表示する", () => {
    const wrapper = mountCard({
      progress: { completed: 1, total: 2, excludedCancelled: 1 },
    });
    expect(wrapper.find(".task-progress").exists()).toBe(true);
    expect(wrapper.text()).toContain("1/2");
    expect(wrapper.text()).toContain("中止 1 件を除く");
  });

  it("中止されたサブタスクが除外されていない場合、除外の理由を表示しない", () => {
    const wrapper = mountCard({
      progress: { completed: 1, total: 2, excludedCancelled: 0 },
    });
    expect(wrapper.text()).toContain("1/2");
    expect(wrapper.text()).not.toContain("中止");
  });
});

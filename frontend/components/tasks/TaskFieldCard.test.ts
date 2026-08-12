import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Case, DevelopmentStage, Task, User } from "../../composables/useApiClient";
import TaskFieldCard from "./TaskFieldCard.vue";

const users: User[] = [
  {
    id: "user-1",
    name: "山田",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const cases: Case[] = [
  {
    id: "case-1",
    name: "新規案件",
    endDate: "2026-09-30",
    isCompleted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "case-2",
    name: "移行案件",
    endDate: "2026-10-31",
    isCompleted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const stages: DevelopmentStage[] = [
  { id: "stage-open", name: "実装中", order: 1, kind: "normal" },
  { id: "stage-done", name: "完了", order: 2, kind: "completed" },
  { id: "stage-cancelled", name: "中止", order: 3, kind: "cancelled" },
];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "認証画面を実装",
    status: "in_progress",
    priority: "high",
    detail: "背景と実装方針",
    caseId: "case-1",
    isRequiredForCase: true,
    parentTaskId: "parent-1",
    assigneeUserId: "user-1",
    developmentStageId: "stage-open",
    scheduledEndDate: "2026-08-10",
    completedAt: "2026-08-09T03:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const parentTask = makeTask({
  id: "parent-1",
  title: "親タスク",
  parentTaskId: null,
  caseId: null,
  isRequiredForCase: false,
});

const childTask = makeTask({
  id: "child-1",
  title: "子タスク",
  parentTaskId: "task-1",
  caseId: null,
  isRequiredForCase: false,
});

const ParentTaskComboboxStub = defineComponent({
  name: "ParentTaskCombobox",
  props: {
    taskId: { type: String, required: true },
    modelValue: { type: String, default: null },
  },
  emits: ["update:modelValue"],
  template: `
    <button
      type="button"
      data-testid="parent-combobox"
      @click="$emit('update:modelValue', 'parent-2')"
    >
      親タスク候補
    </button>
  `,
});

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

const StageBadgeStub = defineComponent({
  name: "StageBadge",
  props: {
    kind: { type: String, default: null },
    name: { type: String, default: null },
    prefixMode: { type: String, default: "list" },
  },
  template: `<span data-testid="stage-badge">{{ name ?? "未設定" }}</span>`,
});

function mountCard(
  task: Task = makeTask(),
  onUpdate = vi.fn().mockResolvedValue(undefined),
  editable = true,
) {
  return mount(TaskFieldCard, {
    props: {
      task,
      users,
      stages,
      cases,
      parentTask,
      childTasks: [childTask],
      editable,
      today: "2026-08-12",
      onUpdate,
    },
    global: {
      stubs: {
        ParentTaskCombobox: ParentTaskComboboxStub,
        StatusBadge: StatusBadgeStub,
        PriorityBadge: PriorityBadgeStub,
        StageBadge: StageBadgeStub,
      },
    },
  });
}

describe("TaskFieldCard", () => {
  it("単一カード内に状態、担当・日程・案件、詳細、親子の表示項目をまとめる", () => {
    const wrapper = mountCard();

    expect(wrapper.get('[data-testid="task-field-card"]').text()).toContain("状態");
    expect(wrapper.text()).toContain("担当・日程・案件");
    expect(wrapper.text()).toContain("認証画面を実装");
    expect(wrapper.text()).toContain("山田");
    expect(wrapper.text()).toContain("新規案件");
    expect(wrapper.text()).toContain("必須");
    expect(wrapper.text()).toContain("2026/08/10");
    expect(wrapper.text()).toContain("背景と実装方針");
    expect(wrapper.text()).toContain("親タスク");
    expect(wrapper.text()).toContain("子タスク");
    expect(wrapper.findComponent({ name: "StatusBadge" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "PriorityBadge" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "StageBadge" }).exists()).toBe(true);
  });

  it.each(["stage-done", "stage-cancelled"])(
    "クローズ種別の開発段階ではステータスと超過バッジを表示しない: %s",
    (developmentStageId) => {
      const wrapper = mountCard(makeTask({ developmentStageId, completedAt: null }));

      expect(wrapper.findComponent({ name: "StatusBadge" }).exists()).toBe(false);
      expect(wrapper.find('[data-testid="overdue-badge"]').exists()).toBe(false);
    },
  );

  it("終了予定日が今日より前で未クローズなら完了日時の有無に関係なく超過を表示する", () => {
    const wrapper = mountCard(makeTask({ completedAt: "2026-08-09T03:00:00.000Z" }));

    expect(wrapper.get('[data-testid="overdue-badge"]').text()).toBe("超過");
  });

  it("完了日時は表示するが編集操作を提示しない", () => {
    const wrapper = mountCard();
    const completedAt = wrapper.get('[data-testid="completed-at-field"]');

    expect(completedAt.text()).toContain("2026/08/09");
    expect(completedAt.find('button[aria-label="完了日時を編集"]').exists()).toBe(false);
  });

  it("案件ピッカー内で案件と必須設定をまとめて更新する", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask(), onUpdate);

    await wrapper.get('button[aria-label="案件を編集"]').trigger("click");
    await wrapper.get('select[aria-label="案件を選択"]').setValue("case-2");
    await wrapper.get('button[role="switch"]').trigger("click");
    await wrapper.get('[data-testid="case-picker-form"]').trigger("submit");
    await flushPromises();

    expect(onUpdate).toHaveBeenCalledWith("case", {
      caseId: "case-2",
      isRequiredForCase: false,
    });
  });

  it("親タスク選択をフィールド更新コールバックへ渡す", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask(), onUpdate);

    await wrapper.get('button[aria-label="親タスクを編集"]').trigger("click");
    await wrapper.get('[data-testid="parent-combobox"]').trigger("click");
    await wrapper.get('[data-testid="parent-picker-form"]').trigger("submit");
    await flushPromises();

    expect(onUpdate).toHaveBeenCalledWith("parentTaskId", "parent-2");
  });
});

import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Case, DevelopmentStage, Task, User } from "../../composables/useApiClient";
import UserAvatar from "../shared/UserAvatar.vue";
import TaskFieldCard from "./TaskFieldCard.vue";

const users: User[] = [
  {
    id: "user-1",
    name: "山田",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "user-2",
    name: "佐藤",
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
    scheduledEndDate: "2026-08-10T00:00:00.000Z",
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

const NuxtLinkStub = defineComponent({
  name: "NuxtLink",
  props: { to: { type: [String, Object], required: true } },
  template: `<a :href="typeof to === 'string' ? to : '#'"><slot /></a>`,
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

const DatePickerStub = defineComponent({
  name: "DatePicker",
  props: {
    modelValue: { type: String, default: "" },
    ariaLabel: { type: String, default: "" },
    embedded: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "dismissed"],
  template: `
    <div data-testid="scheduled-end-date-picker">
      <button type="button" @click="$emit('update:modelValue', '2026-08-20')">決定</button>
      <button type="button" @click="$emit('dismissed')">キャンセル</button>
    </div>
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
  onUpdate?: (field: string, value: unknown) => Promise<void>,
  editable = true,
  extras: { parentTask?: Task | null; childTasks?: Task[] } = {},
) {
  return mount(TaskFieldCard, {
    props: {
      task,
      users,
      stages,
      cases,
      parentTask: extras.parentTask === undefined ? parentTask : extras.parentTask,
      childTasks: extras.childTasks ?? [childTask],
      workspaceId: "ws-1",
      editable,
      today: "2026-08-12",
      currentUserId: "user-1",
      onUpdate: onUpdate ?? vi.fn().mockResolvedValue(undefined),
    },
    global: {
      stubs: {
        NuxtLink: NuxtLinkStub,
        ParentTaskCombobox: ParentTaskComboboxStub,
        DatePicker: DatePickerStub,
        StatusBadge: StatusBadgeStub,
        PriorityBadge: PriorityBadgeStub,
        StageBadge: StageBadgeStub,
      },
    },
  });
}

async function openRelatedTasks(wrapper: ReturnType<typeof mountCard>) {
  await wrapper.get('[data-testid="related-tasks-toggle"]').trigger("click");
}

describe("TaskFieldCard", () => {
  it("単一カード内にフィールドと親子をまとめ、グループ見出しは出さない", () => {
    const wrapper = mountCard();

    expect(wrapper.get('[data-testid="task-field-card"]').text()).not.toContain("状態");
    expect(wrapper.text()).not.toContain("担当・日程・案件");
    expect(wrapper.find("h2").text()).toBe("親子タスク");
    expect(wrapper.get('[data-testid="related-tasks-toggle"]').attributes("aria-expanded")).toBe(
      "false",
    );
    expect(wrapper.find('[data-testid="parent-task-link"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="child-task-list"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="タイトルを編集"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("認証画面を実装");
    expect(wrapper.text()).toContain("山田");
    expect(wrapper.text()).toContain("新規案件");
    expect(wrapper.text()).toContain("必須");
    expect(wrapper.text()).toContain("2026/08/10");
    expect(wrapper.text()).toContain("背景と実装方針");
    expect(wrapper.findComponent({ name: "StatusBadge" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "PriorityBadge" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "StageBadge" }).exists()).toBe(true);
  });

  it.each(["stage-done", "stage-cancelled"])(
    "クローズ種別の開発段階ではステータスと超過バッジを表示しない: %s",
    (developmentStageId) => {
      const wrapper = mountCard(makeTask({ developmentStageId, completedAt: null }), undefined, true, {
        childTasks: [],
      });

      expect(wrapper.findComponent({ name: "StatusBadge" }).exists()).toBe(false);
      expect(wrapper.find('[data-testid="overdue-badge"]').exists()).toBe(false);
    },
  );

  it("終了予定日が今日より前で未クローズなら完了日時の有無に関係なく超過を表示する", () => {
    const wrapper = mountCard(makeTask({ completedAt: "2026-08-09T03:00:00.000Z" }));

    expect(wrapper.get('[data-testid="overdue-badge"]').text()).toBe("超過");
  });

  it("フィールド行はラベルを固定幅で左詰めし、値を右寄せしない", () => {
    const wrapper = mountCard();
    const statusRow = wrapper.get('[aria-label="ステータスの行。選択すると編集操作を表示します"]');
    const label = statusRow.get("span");

    expect(statusRow.find(".justify-between").exists()).toBe(false);
    expect(label.classes()).toContain("w-[88px]");
    expect(label.classes()).toContain("shrink-0");
  });

  it("完了日時は表示するが編集操作を提示しない", () => {
    const wrapper = mountCard();
    const completedAt = wrapper.get('[data-testid="completed-at-field"]');

    expect(completedAt.text()).toContain("2026/08/09");
    expect(completedAt.get('[data-testid="completed-at-value"]').classes()).toContain("text-slate-800");
    expect(completedAt.find('button[aria-label="完了日時を編集"]').exists()).toBe(false);
  });

  it("完了日時が無いときはプレースホルダを淡色で出す", () => {
    const wrapper = mountCard(makeTask({ completedAt: null }));
    const value = wrapper.get('[data-testid="completed-at-value"]');

    expect(value.text()).toBe("—");
    expect(value.classes()).toContain("text-slate-400");
    expect(value.classes()).not.toContain("text-slate-800");
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

  it("親子タスクは開くと親と子を表示する", async () => {
    const wrapper = mountCard();

    await openRelatedTasks(wrapper);

    expect(wrapper.get('[data-testid="related-tasks-toggle"]').attributes("aria-expanded")).toBe(
      "true",
    );
    expect(wrapper.get('[data-testid="parent-task-link"]').text()).toBe("親タスク");
    expect(wrapper.get('[data-testid="child-task-list"]').text()).toContain("子タスク");
  });

  it("親タスクのタイトルは詳細ページへのリンクにする", async () => {
    const wrapper = mountCard();
    await openRelatedTasks(wrapper);

    expect(wrapper.get('[data-testid="parent-task-link"]').attributes("href")).toBe(
      "/workspaces/ws-1/tasks/parent-1",
    );
    expect(wrapper.get('[data-testid="parent-task-link"]').text()).toBe("親タスク");
  });

  it("親タスクが未設定ならリンクを出さず未設定と表示する", async () => {
    const wrapper = mountCard(makeTask({ parentTaskId: null }), undefined, true, {
      parentTask: null,
      childTasks: [],
    });
    await openRelatedTasks(wrapper);

    expect(wrapper.find('[data-testid="parent-task-link"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="parent-task-value"]').text()).toBe("未設定");
  });

  it("子タスクは件数・ステータス・タイトルリンク・担当者を1行で表示する", async () => {
    const wrapper = mountCard();
    await openRelatedTasks(wrapper);
    const list = wrapper.get('[data-testid="child-task-list"]');

    expect(wrapper.get('[data-testid="child-task-count"]').text()).toBe("1");
    expect(list.get("a").attributes("href")).toBe("/workspaces/ws-1/tasks/child-1");
    expect(list.get("a").text()).toBe("子タスク");
    expect(list.text()).toContain("山田");
    expect(list.findComponent({ name: "StatusBadge" }).exists()).toBe(true);
    expect(wrapper.find('button[aria-label="子タスクを編集"]').exists()).toBe(false);
  });

  it("クローズ済みの子タスクはステータスの代わりに段階名を出し、タイトルを弱める", async () => {
    const closedChild = makeTask({
      id: "child-done",
      title: "再現手順の整理",
      parentTaskId: "task-1",
      developmentStageId: "stage-done",
      status: "not_started",
    });
    const wrapper = mountCard(makeTask(), undefined, true, { childTasks: [closedChild] });
    await openRelatedTasks(wrapper);
    const row = wrapper.get('[data-testid="child-task-list"] li');

    expect(row.findComponent({ name: "StatusBadge" }).exists()).toBe(false);
    expect(row.text()).toContain("完了");
    expect(row.get("a").classes()).toContain("text-slate-500");
  });

  it("親タスク選択をフィールド更新コールバックへ渡す", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask(), onUpdate);
    await openRelatedTasks(wrapper);

    await wrapper.get('button[aria-label="親タスクを編集"]').trigger("click");
    await wrapper.get('[data-testid="parent-combobox"]').trigger("click");
    await flushPromises();

    expect(onUpdate).toHaveBeenCalledWith("parentTaskId", "parent-2");
  });

  it("単一選択フィールドは選択肢のクリックで即保存し、保存ボタンを出さない", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask(), onUpdate);

    await wrapper.get('button[aria-label="ステータスを編集"]').trigger("click");
    const statusPicker = wrapper.get('[data-testid="inline-editable-picker"]');
    expect(statusPicker.find('button[type="submit"]').exists()).toBe(false);
    expect(statusPicker.find("select").exists()).toBe(false);

    await statusPicker.get('[role="option"][aria-label="未着手"]').trigger("click");
    await flushPromises();

    expect(onUpdate).toHaveBeenCalledWith("status", "not_started");
  });

  it("終了予定日は既存の DatePicker で選び、決定で保存する", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask(), onUpdate);

    await wrapper.get('button[aria-label="終了予定日を編集"]').trigger("click");

    expect(wrapper.find('input[type="date"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="scheduled-end-date-picker"]').exists()).toBe(true);

    await wrapper.get('[data-testid="scheduled-end-date-picker"]').get("button").trigger("click");
    await flushPromises();

    expect(onUpdate).toHaveBeenCalledWith("scheduledEndDate", "2026-08-20");
  });

  it("担当者ピッカーから自分を即設定できる", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask({ assigneeUserId: null }), onUpdate);

    await wrapper.get('button[aria-label="担当者を編集"]').trigger("click");
    await wrapper.get('button[aria-label="担当者を自分にする"]').trigger("click");
    await flushPromises();

    expect(onUpdate).toHaveBeenCalledWith("assigneeUserId", "user-1");
  });

  it("詳細は本文を差し替えて Ctrl+Enter で更新する", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask(), onUpdate);

    expect(wrapper.get('[data-testid="task-detail-display"]').text()).toBe("背景と実装方針");

    await wrapper.get('button[aria-label="詳細を編集"]').trigger("click");

    expect(wrapper.find('[data-testid="task-detail-display"]').exists()).toBe(false);
    const picker = wrapper.get('[data-testid="inline-editable-picker"]');
    expect(picker.text()).not.toContain("Enter で保存");
    expect(picker.get("button[type='submit']").text()).toBe("更新");
    expect(picker.get("button[type='button']").text()).toBe("キャンセル");

    const textarea = wrapper.get('textarea[aria-label="詳細を入力"]');
    await textarea.setValue("新しい詳細");
    await textarea.trigger("keydown", { key: "Enter", ctrlKey: true });
    await flushPromises();

    expect(onUpdate).toHaveBeenCalledWith("detail", "新しい詳細");
  });

  it("メイン担当者フィールドの氏名に UserAvatar を併記する（size 24、name なし）", () => {
    const wrapper = mountCard();
    const row = wrapper.get('[aria-label="担当者の行。選択すると編集操作を表示します"]');
    const avatar = row.getComponent(UserAvatar);

    expect(avatar.props("userId")).toBe("user-1");
    expect(avatar.props("size")).toBe(24);
    expect(avatar.props("name")).toBeUndefined();
    expect(avatar.attributes("aria-hidden")).toBe("true");
    expect(row.text()).toContain("山田");
  });

  it("担当者が未設定のときはメインフィールドに UserAvatar を出さない", () => {
    const wrapper = mountCard(makeTask({ assigneeUserId: null }));
    const row = wrapper.get('[aria-label="担当者の行。選択すると編集操作を表示します"]');

    expect(row.findComponent(UserAvatar).exists()).toBe(false);
    expect(row.text()).toContain("未設定");
  });

  it("子タスク行の担当者ラベルに UserAvatar を併記する（size 24、name なし）", async () => {
    const wrapper = mountCard();
    await openRelatedTasks(wrapper);
    const list = wrapper.get('[data-testid="child-task-list"]');
    const avatar = list.getComponent(UserAvatar);

    expect(avatar.props("userId")).toBe("user-1");
    expect(avatar.props("size")).toBe(24);
    expect(avatar.props("name")).toBeUndefined();
    expect(avatar.attributes("aria-hidden")).toBe("true");
    expect(list.text()).toContain("山田");
  });

  it("子タスクに担当者がいないときは UserAvatar を出さない", async () => {
    const unassignedChild = makeTask({
      id: "child-unassigned",
      title: "未割当の子",
      parentTaskId: "task-1",
      assigneeUserId: null,
    });
    const wrapper = mountCard(makeTask({ assigneeUserId: null }), undefined, true, {
      childTasks: [unassignedChild],
    });
    await openRelatedTasks(wrapper);
    const list = wrapper.get('[data-testid="child-task-list"]');

    expect(list.findComponent(UserAvatar).exists()).toBe(false);
    expect(list.text()).toContain("未設定");
  });

  it("担当者ドロップダウンの各選択肢に #leading 経由で UserAvatar を差し込む（size 20、name なし）", async () => {
    const wrapper = mountCard();
    await wrapper.get('button[aria-label="担当者を編集"]').trigger("click");
    const picker = wrapper.get('[data-testid="inline-editable-picker"]');
    const options = picker.findAll('[role="option"]');
    const avatars = picker.findAllComponents(UserAvatar);

    expect(options).toHaveLength(users.length);
    expect(avatars).toHaveLength(users.length);
    for (const [index, user] of users.entries()) {
      const option = options[index]!;
      const avatar = avatars[index]!;
      expect(avatar.props("userId")).toBe(user.id);
      expect(avatar.props("size")).toBe(20);
      expect(avatar.props("name")).toBeUndefined();
      expect(avatar.attributes("aria-hidden")).toBe("true");
      expect(option.element.children[0]).toBe(avatar.element);
      expect(option.text()).toContain(user.name);
    }
  });

  it.each([
    ["ステータス", "ステータスを編集"],
    ["優先度", "優先度を編集"],
    ["開発段階", "開発段階を編集"],
  ] as const)("%s の FieldOptionList には UserAvatar を渡さない", async (_label, editAria) => {
    const wrapper = mountCard();
    await wrapper.get(`button[aria-label="${editAria}"]`).trigger("click");
    const picker = wrapper.get('[data-testid="inline-editable-picker"]');

    expect(picker.find('[role="option"]').exists()).toBe(true);
    expect(picker.findComponent(UserAvatar).exists()).toBe(false);
  });

  // velocity-dashboard 5.3 / mock 1h-c: leaf editable picker, parent read-only sum
  it("葉タスクはストーリーポイント行をクリックすると編集ピッカーが開き保存できる", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask({ storyPoints: 5 }), onUpdate, true, {
      childTasks: [],
    });

    expect(wrapper.text()).toContain("ストーリーポイント");
    expect(wrapper.text()).toContain("5");
    expect(wrapper.find('[data-testid="story-points-parent-badge"]').exists()).toBe(false);

    await wrapper.get('button[aria-label="ストーリーポイントを編集"]').trigger("click");
    const picker = wrapper.get('[data-testid="inline-editable-picker"]');
    expect(picker.find('input[data-testid="story-points-input"]').exists()).toBe(true);
    expect(picker.text()).toContain("1 以上の整数");

    await picker.get('input[data-testid="story-points-input"]').setValue("8");
    await picker.get('[data-testid="story-points-picker-form"]').trigger("submit");
    await flushPromises();

    expect(onUpdate).toHaveBeenCalledWith("storyPoints", 8);
  });

  it("葉タスクで未設定のストーリーポイントはプレースホルダを表示する", () => {
    const wrapper = mountCard(makeTask({ storyPoints: null }), undefined, true, {
      childTasks: [],
    });

    expect(wrapper.get('[data-testid="story-points-value"]').text()).toBe("—");
  });

  it("葉タスクで空入力を保存すると storyPoints に null を渡す", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask({ storyPoints: 3 }), onUpdate, true, {
      childTasks: [],
    });

    await wrapper.get('button[aria-label="ストーリーポイントを編集"]').trigger("click");
    const picker = wrapper.get('[data-testid="inline-editable-picker"]');
    await picker.get('input[data-testid="story-points-input"]').setValue("");
    await picker.get('[data-testid="story-points-picker-form"]').trigger("submit");
    await flushPromises();

    expect(onUpdate).toHaveBeenCalledWith("storyPoints", null);
  });

  it("親タスクのストーリーポイント行は読み取り専用でピッカーを開かない", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard(makeTask({ storyPoints: 13 }), onUpdate, true, {
      childTasks: [childTask],
    });

    const field = wrapper.get('[data-testid="story-points-field"]');
    expect(field.text()).toContain("13");
    expect(wrapper.get('[data-testid="story-points-parent-badge"]').text()).toBe(
      "子の合計(自動計算)",
    );
    expect(wrapper.find('button[aria-label="ストーリーポイントを編集"]').exists()).toBe(false);
    expect(field.attributes("title")).toBe("子タスクの合計のため直接編集できません");

    await field.trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="inline-editable-picker"]').exists()).toBe(false);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

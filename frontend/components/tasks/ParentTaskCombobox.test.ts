import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ParentTaskCombobox from "./ParentTaskCombobox.vue";
import type { Task, TaskListFilter } from "../../composables/useApiClient";

const listTasks = vi.fn<(filter?: TaskListFilter) => Promise<Task[]>>();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({ listTasks }),
  };
});

function makeTask(id: string, title: string): Task {
  return {
    id,
    title,
    status: "not_started",
    priority: "medium",
    isRequiredForCase: false,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
  };
}

function mountCombobox(modelValue: string | null = null) {
  return mount(ParentTaskCombobox, {
    props: {
      taskId: "task-current",
      modelValue,
    },
  });
}

describe("ParentTaskCombobox", () => {
  beforeEach(() => {
    listTasks.mockReset();
    listTasks.mockResolvedValue([makeTask("task-valid", "有効な親タスク")]);
  });

  it("自身・子孫・クローズ済みを除外する条件で初期候補を取得する", async () => {
    const wrapper = mountCombobox();
    await flushPromises();

    expect(listTasks).toHaveBeenCalledWith({
      titleContains: "",
      excludeSubtreeOf: "task-current",
      excludeClosed: true,
    });
    expect(wrapper.get('[role="option"]').text()).toContain("有効な親タスク");
    expect(wrapper.text()).not.toContain("自身のタスク");
    expect(wrapper.text()).not.toContain("子孫タスク");
    expect(wrapper.text()).not.toContain("クローズ済みタスク");
  });

  it("入力したタイトルを検索条件にして候補を更新する", async () => {
    listTasks
      .mockResolvedValueOnce([makeTask("task-initial", "初期候補")])
      .mockResolvedValueOnce([makeTask("task-design", "設計タスク")]);
    const wrapper = mountCombobox();
    await flushPromises();

    await wrapper.get('input[role="combobox"]').setValue("設計");
    await flushPromises();

    expect(listTasks).toHaveBeenLastCalledWith({
      titleContains: "設計",
      excludeSubtreeOf: "task-current",
      excludeClosed: true,
    });
    expect(wrapper.get('[role="option"]').text()).toContain("設計タスク");
    expect(wrapper.text()).not.toContain("初期候補");
  });

  it("候補を選ぶと親タスク ID を emit する", async () => {
    const wrapper = mountCombobox();
    await flushPromises();

    await wrapper.get('[role="option"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["task-valid"]]);
    expect((wrapper.get('input[role="combobox"]').element as HTMLInputElement).value).toBe(
      "有効な親タスク",
    );
  });

  it("親タスクなしを選ぶと null を emit する", async () => {
    const wrapper = mountCombobox("task-valid");
    await flushPromises();

    await wrapper.get('button[aria-label="親タスクを解除"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([[null]]);
  });

  it("候補取得に失敗した場合は画面内にエラーを表示する", async () => {
    listTasks.mockRejectedValue(new Error("候補を取得できませんでした"));
    const wrapper = mountCombobox();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("候補を取得できませんでした");
  });
});

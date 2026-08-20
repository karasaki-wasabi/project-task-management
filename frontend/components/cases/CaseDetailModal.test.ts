import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import CaseDetailModal from "./CaseDetailModal.vue";
import type { Case, CaseProgress, DevelopmentStage, Task } from "../../composables/useApiClient";

const listCases = vi.fn();
const getCaseProgress = vi.fn();
const listTasks = vi.fn();
const listDevelopmentStages = vi.fn();
const updateCase = vi.fn();
const deleteCase = vi.fn();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listCases,
      getCaseProgress,
      listTasks,
      listDevelopmentStages,
      updateCase,
      deleteCase,
    }),
  };
});

const ModalStub = defineComponent({
  name: "Modal",
  props: {
    open: { type: Boolean, required: true },
    ariaLabel: { type: String, required: false },
  },
  emits: ["close"],
  template: `
    <div v-if="open" data-testid="modal" role="dialog">
      <div data-testid="modal-title"><slot name="title" /></div>
      <div data-testid="modal-body"><slot /></div>
      <div data-testid="modal-actions"><slot name="actions" /></div>
      <button type="button" aria-label="閉じる" @click="$emit('close')">×</button>
    </div>
  `,
});

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<div data-testid="error-alert">{{ message }}</div>`,
});

const DatePickerStub = defineComponent({
  name: "DatePicker",
  props: {
    modelValue: { type: String, default: "" },
    ariaLabel: { type: String, default: "" },
  },
  emits: ["update:modelValue"],
  template: `
    <input
      :aria-label="ariaLabel"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target).value)"
    />
  `,
});

const BadgeStub = defineComponent({
  name: "Badge",
  props: {
    tone: { type: String, required: true },
    label: { type: String, required: true },
  },
  template: `<span data-testid="badge">{{ label }}</span>`,
});

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: "c1",
    name: "案件A",
    startDate: "2026-08-01",
    endDate: "2026-08-10",
    isCompleted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProgress(overrides: Partial<CaseProgress> = {}): CaseProgress {
  return {
    requiredTotal: 0,
    requiredCompleted: 0,
    requiredIncomplete: 0,
    isOverdueWithIncomplete: false,
    ...overrides,
  };
}

function makeStage(overrides: Partial<DevelopmentStage> & { id: string }): DevelopmentStage {
  return {
    name: overrides.id,
    order: 0,
    kind: "normal",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: `task-${overrides.id}`,
    status: "not_started",
    priority: "medium",
    isRequiredForCase: true,
    developmentStageId: "s-normal",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const defaultStages: DevelopmentStage[] = [
  makeStage({ id: "s-normal", name: "実装", kind: "normal", order: 1 }),
  makeStage({ id: "s-done", name: "完了", kind: "completed", order: 2 }),
  makeStage({ id: "s-cancel", name: "中止", kind: "cancelled", order: 3 }),
];

function mountDetail(caseId: string | null = "c1") {
  return mount(CaseDetailModal, {
    props: { caseId },
    global: {
      stubs: {
        Modal: ModalStub,
        ErrorAlert: ErrorAlertStub,
        DatePicker: DatePickerStub,
        Badge: BadgeStub,
      },
    },
  });
}

function buttonByText(wrapper: ReturnType<typeof mountDetail>, text: string) {
  const match = wrapper.findAll("button").find((b) => b.text().trim() === text);
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

async function enterEdit(wrapper: ReturnType<typeof mountDetail>) {
  await flushPromises();
  await buttonByText(wrapper, "編集").trigger("click");
  await nextTick();
}

async function setDates(
  wrapper: ReturnType<typeof mountDetail>,
  start: string,
  end: string,
) {
  await wrapper.get('input[aria-label="開始日"]').setValue(start);
  await wrapper.get('input[aria-label="終了日"]').setValue(end);
}

async function submitEdit(wrapper: ReturnType<typeof mountDetail>) {
  await wrapper.get("#case-detail-form").trigger("submit");
  await flushPromises();
  await nextTick();
}

describe("CaseDetailModal 編集 + テンプレート適用確認（task 6.3）", () => {
  beforeEach(() => {
    listCases.mockReset();
    getCaseProgress.mockReset();
    listTasks.mockReset();
    listDevelopmentStages.mockReset();
    updateCase.mockReset();
    deleteCase.mockReset();
    listCases.mockResolvedValue([makeCase()]);
    getCaseProgress.mockResolvedValue(makeProgress());
    listTasks.mockResolvedValue([] as Task[]);
    listDevelopmentStages.mockResolvedValue(defaultStages);
    updateCase.mockResolvedValue(makeCase());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("日付に基づく候補がない場合、templateOperations を省略して直接保存する（Req 4.12）", async () => {
    const wrapper = mountDetail();
    await enterEdit(wrapper);

    await wrapper.get("#case-detail-name").setValue("案件A改");
    // 日付が変更されていない → 候補が空
    await submitEdit(wrapper);

    expect(wrapper.text()).not.toContain("テンプレートタスクへの反映");
    expect(updateCase).toHaveBeenCalledTimes(1);
    expect(updateCase).toHaveBeenCalledWith("c1", {
      name: "案件A改",
      startDate: "2026-08-01",
      endDate: "2026-08-10",
      isCompleted: false,
    });
    expect(updateCase.mock.calls[0]![1]).not.toHaveProperty("templateOperations");
  });

  it("日付の変更: 画面Bを表示し、画面Cを表示する; キャンセルは編集を保持し、PATCHをスキップする（Req 4.1, 4.4）", async () => {
    const wrapper = mountDetail();
    await enterEdit(wrapper);

    // 開始日が後に移動したが、まだ終了日以下 → start_regenerate + month_regenerate
    await setDates(wrapper, "2026-08-05", "2026-08-10");
    await submitEdit(wrapper);

    expect(updateCase).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("テンプレートタスクへの反映");
    expect(wrapper.text()).toContain("案件開始日起点のタスクを生成し直し");

    // 確認のキャンセル (次への兄弟)、編集フォームのキャンセルではない
    const nextBtn = buttonByText(wrapper, "次へ");
    const confirmActions = nextBtn.element.parentElement;
    const confirmCancel = wrapper
      .findAll("button")
      .find((b) => b.text().trim() === "キャンセル" && b.element.parentElement === confirmActions);
    if (!confirmCancel) throw new Error("confirm cancel button not found");
    await confirmCancel.trigger("click");
    await flushPromises();
    await nextTick();

    expect(updateCase).not.toHaveBeenCalled();
    // まだ編集中 — 変更された日付が保存されていないフォームが保持される（Req 4.4）
    expect(wrapper.find("#case-detail-form").exists()).toBe(true);
    expect(wrapper.get('input[aria-label="開始日"]').element).toHaveProperty("value", "2026-08-05");
  });

  it("すべての候補をチェック解除し、承認する: templateOperations [] を含む PATCH（Req 4.3, 4.13）", async () => {
    updateCase.mockResolvedValue(
      makeCase({ startDate: "2026-08-05", endDate: "2026-08-10", name: "案件A" }),
    );
    const wrapper = mountDetail();
    await enterEdit(wrapper);

    await setDates(wrapper, "2026-08-05", "2026-08-10");
    await submitEdit(wrapper);

    expect(wrapper.text()).toContain("テンプレートタスクへの反映");

    // すべての候補チェックボックスをチェック解除する（start_regenerate + month_regenerate）
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
    for (const box of checkboxes) {
      await box.trigger("click");
    }

    await buttonByText(wrapper, "次へ").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("実行内容の確認");
    expect(wrapper.text()).toContain("テンプレートタスクへの操作はありません");

    await buttonByText(wrapper, "実行する").trigger("click");
    await flushPromises();
    await nextTick();

    expect(updateCase).toHaveBeenCalledTimes(1);
    expect(updateCase).toHaveBeenCalledWith("c1", {
      name: "案件A",
      startDate: "2026-08-05",
      endDate: "2026-08-10",
      isCompleted: false,
      templateOperations: [],
    });
  });

  it("選択されたサブセットを承認する: 選択された操作を含む PATCH（Req 4.3, 4.6, 4.10）", async () => {
    updateCase.mockResolvedValue(
      makeCase({ startDate: "2026-08-05", endDate: "2026-08-10" }),
    );
    const wrapper = mountDetail();
    await enterEdit(wrapper);

    await setDates(wrapper, "2026-08-05", "2026-08-10");
    await submitEdit(wrapper);

    // デフォルトを保持する（すべてチェック済み）: start_regenerate + month_regenerate
    await buttonByText(wrapper, "次へ").trigger("click");
    await flushPromises();
    await buttonByText(wrapper, "実行する").trigger("click");
    await flushPromises();
    await nextTick();

    expect(updateCase).toHaveBeenCalledTimes(1);
    expect(updateCase.mock.calls[0]![1]).toEqual({
      name: "案件A",
      startDate: "2026-08-05",
      endDate: "2026-08-10",
      isCompleted: false,
      templateOperations: ["start_regenerate", "month_regenerate"],
    });
  });

  it("開始日が null→値: 候補に start_generate（両方が設定されている場合は month）を含む（Req 4.5, 4.9）", async () => {
    listCases.mockResolvedValue([
      makeCase({ startDate: null, endDate: null }),
    ]);
    updateCase.mockResolvedValue(
      makeCase({ startDate: "2026-08-01", endDate: "2026-08-10" }),
    );
    const wrapper = mountDetail();
    await enterEdit(wrapper);

    await setDates(wrapper, "2026-08-01", "2026-08-10");
    await submitEdit(wrapper);

    expect(wrapper.text()).toContain("テンプレートタスクへの反映");
    expect(wrapper.text()).toContain("案件開始日起点のタスクを追加");
    expect(wrapper.text()).toContain("各月初・各月末起点のタスクを追加");
    expect(updateCase).not.toHaveBeenCalled();
  });
});

describe("CaseDetailModal 必須タスク（task-status-model 5.6）", () => {
  beforeEach(() => {
    listCases.mockReset();
    getCaseProgress.mockReset();
    listTasks.mockReset();
    listDevelopmentStages.mockReset();
    listCases.mockResolvedValue([makeCase()]);
    listDevelopmentStages.mockResolvedValue(defaultStages);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("案件を開いたとき、開発ステージを取得する", async () => {
    getCaseProgress.mockResolvedValue(makeProgress({ requiredTotal: 1, requiredCompleted: 0 }));
    listTasks.mockResolvedValue([]);
    mountDetail();
    await flushPromises();
    expect(listDevelopmentStages).toHaveBeenCalled();
  });

  it("必要なタスクの進捗が0の場合、必須タスクの進捗を非表示にする（Requirement 6.6）", async () => {
    getCaseProgress.mockResolvedValue(makeProgress({ requiredTotal: 0, requiredCompleted: 0 }));
    listTasks.mockResolvedValue([
      makeTask({ id: "t-cancel", developmentStageId: "s-cancel", isRequiredForCase: true }),
    ]);
    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.text()).toContain("必須タスク進捗");
    expect(wrapper.text()).not.toContain("0 / 0");
    expect(wrapper.find('[data-testid="required-progress"]').exists()).toBe(false);
  });

  it("必要なタスクの進捗が1以上の場合、必須タスクの進捗を表示する", async () => {
    getCaseProgress.mockResolvedValue(
      makeProgress({ requiredTotal: 2, requiredCompleted: 1, requiredIncomplete: 1 }),
    );
    listTasks.mockResolvedValue([]);
    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.find('[data-testid="required-progress"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("1 / 2");
  });

  it("完了ステージの必須タスクは、完了としてマークされ、ステータス ready_for_handoff ではない（Requirement 8.3）", async () => {
    getCaseProgress.mockResolvedValue(
      makeProgress({ requiredTotal: 2, requiredCompleted: 1, requiredIncomplete: 1 }),
    );
    listTasks.mockResolvedValue([
      makeTask({
        id: "t-done",
        title: "完了済み必須",
        developmentStageId: "s-done",
        status: "not_started",
        isRequiredForCase: true,
      }),
      makeTask({
        id: "t-open",
        title: "未完了必須",
        developmentStageId: "s-normal",
        status: "ready_for_handoff",
        isRequiredForCase: true,
      }),
    ]);
    const wrapper = mountDetail();
    await flushPromises();

    const marks = wrapper.findAll('[data-testid="required-task-mark"]');
    expect(marks).toHaveLength(2);
    expect(marks[0]!.attributes("aria-label")).toBe("完了");
    expect(marks[0]!.text()).toBe("✓");
    expect(marks[1]!.attributes("aria-label")).toBe("未完了");
    expect(marks[1]!.text()).toBe("○");
  });

  it("中止した必須タスクは、不完全としてマークされない", async () => {
    getCaseProgress.mockResolvedValue(makeProgress({ requiredTotal: 1, requiredCompleted: 0 }));
    listTasks.mockResolvedValue([
      makeTask({
        id: "t-cancel",
        title: "中止した必須",
        developmentStageId: "s-cancel",
        status: "in_progress",
        isRequiredForCase: true,
      }),
    ]);
    const wrapper = mountDetail();
    await flushPromises();

    const mark = wrapper.get('[data-testid="required-task-mark"]');
    expect(mark.attributes("aria-label")).toBe("中止");
    expect(mark.attributes("aria-label")).not.toBe("未完了");
    expect(mark.text()).not.toBe("○");
  });
});


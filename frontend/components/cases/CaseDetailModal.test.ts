// Mount tests for CaseDetailModal:
// - task 6.3 edit save flow (candidates → B/C confirm → PATCH)
// - task-status-model 5.6 required-task completion marks + mother-0 progress
// Requirements 4.1–4.13, 6.6, 8.3.
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

describe("CaseDetailModal edit + template apply confirm (task 6.3)", () => {
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

  it("no date-driven candidates: saves directly with templateOperations omitted (Req 4.12)", async () => {
    const wrapper = mountDetail();
    await enterEdit(wrapper);

    await wrapper.get("#case-detail-name").setValue("案件A改");
    // dates unchanged → candidates empty
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

  it("date change: shows screen B then C; cancel keeps edit and skips PATCH (Req 4.1, 4.4)", async () => {
    const wrapper = mountDetail();
    await enterEdit(wrapper);

    // start moves later but still <= end → start_regenerate + month_regenerate
    await setDates(wrapper, "2026-08-05", "2026-08-10");
    await submitEdit(wrapper);

    expect(updateCase).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("テンプレートタスクへの反映");
    expect(wrapper.text()).toContain("案件開始日起点のタスクを生成し直し");

    // Confirm's キャンセル (sibling of 次へ), not the edit-form キャンセル
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
    // still editing — form kept with unsaved date change (Req 4.4)
    expect(wrapper.find("#case-detail-form").exists()).toBe(true);
    expect(wrapper.get('input[aria-label="開始日"]').element).toHaveProperty("value", "2026-08-05");
  });

  it("uncheck all candidates then approve: PATCH with templateOperations [] (Req 4.3, 4.13)", async () => {
    updateCase.mockResolvedValue(
      makeCase({ startDate: "2026-08-05", endDate: "2026-08-10", name: "案件A" }),
    );
    const wrapper = mountDetail();
    await enterEdit(wrapper);

    await setDates(wrapper, "2026-08-05", "2026-08-10");
    await submitEdit(wrapper);

    expect(wrapper.text()).toContain("テンプレートタスクへの反映");

    // Uncheck every candidate checkbox (start_regenerate + month_regenerate)
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

  it("approve selected subset: PATCH includes chosen operations (Req 4.3, 4.6, 4.10)", async () => {
    updateCase.mockResolvedValue(
      makeCase({ startDate: "2026-08-05", endDate: "2026-08-10" }),
    );
    const wrapper = mountDetail();
    await enterEdit(wrapper);

    await setDates(wrapper, "2026-08-05", "2026-08-10");
    await submitEdit(wrapper);

    // Keep defaults (all checked): start_regenerate + month_regenerate
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

  it("start null→value: candidates include start_generate (and month when both set) (Req 4.5, 4.9)", async () => {
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

describe("CaseDetailModal required tasks (task-status-model 5.6)", () => {
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

  it("fetches development stages when opening a case", async () => {
    getCaseProgress.mockResolvedValue(makeProgress({ requiredTotal: 1, requiredCompleted: 0 }));
    listTasks.mockResolvedValue([]);
    mountDetail();
    await flushPromises();
    expect(listDevelopmentStages).toHaveBeenCalled();
  });

  it("hides required-task progress when requiredTotal is 0 (Requirement 6.6)", async () => {
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

  it("shows required-task progress when requiredTotal is positive", async () => {
    getCaseProgress.mockResolvedValue(
      makeProgress({ requiredTotal: 2, requiredCompleted: 1, requiredIncomplete: 1 }),
    );
    listTasks.mockResolvedValue([]);
    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.find('[data-testid="required-progress"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("1 / 2");
  });

  it("marks completed-stage required tasks with 完了, not status ready_for_handoff (Requirement 8.3)", async () => {
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

  it("does not leave cancelled required tasks marked as incomplete", async () => {
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


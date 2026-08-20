// Mount tests for CaseFormModal create flow (task 6.2):
// missing-dates confirm → createCase (ops omitted) → sequential associations.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import CaseFormModal from "./CaseFormModal.vue";
import type { Case, Task } from "../../composables/useApiClient";

const listTasks = vi.fn();
const createCase = vi.fn();
const updateTask = vi.fn();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listTasks,
      createCase,
      updateTask,
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

const PriorityBadgeStub = defineComponent({
  name: "PriorityBadge",
  props: { priority: { type: String, required: true } },
  template: `<span data-testid="priority" />`,
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "task",
    status: "not_started",
    priority: "medium",
    isRequiredForCase: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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

function mountForm(props: { open?: boolean } = {}) {
  return mount(CaseFormModal, {
    props: { open: props.open ?? true },
    global: {
      stubs: {
        Modal: ModalStub,
        ErrorAlert: ErrorAlertStub,
        DatePicker: DatePickerStub,
        PriorityBadge: PriorityBadgeStub,
      },
    },
  });
}

function buttonByText(wrapper: ReturnType<typeof mountForm>, text: string) {
  const match = wrapper.findAll("button").find((b) => b.text().trim() === text);
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

async function fillName(wrapper: ReturnType<typeof mountForm>, name: string) {
  await wrapper.get("#case-form-name").setValue(name);
}

async function setDates(
  wrapper: ReturnType<typeof mountForm>,
  start: string,
  end: string,
) {
  const startInput = wrapper.get('input[aria-label="開始日"]');
  const endInput = wrapper.get('input[aria-label="終了日"]');
  await startInput.setValue(start);
  await endInput.setValue(end);
}

async function submitForm(wrapper: ReturnType<typeof mountForm>) {
  await wrapper.get("#case-form").trigger("submit");
  await flushPromises();
  await nextTick();
}

describe("CaseFormModal 新規作成 + 日付未設定確認（task 6.2）", () => {
  beforeEach(() => {
    listTasks.mockReset();
    createCase.mockReset();
    updateTask.mockReset();
    listTasks.mockResolvedValue([]);
    createCase.mockResolvedValue(makeCase());
    updateTask.mockResolvedValue(makeTask());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("両方の日付が設定されている場合、確認画面をスキップし、createCase で templateOperations を省略する（Req 3.4, 3.6）", async () => {
    const wrapper = mountForm();
    await flushPromises();

    await fillName(wrapper, "案件A");
    await setDates(wrapper, "2026-08-01", "2026-08-10");
    await submitForm(wrapper);

    expect(createCase).toHaveBeenCalledTimes(1);
    expect(createCase).toHaveBeenCalledWith({
      name: "案件A",
      startDate: "2026-08-01",
      endDate: "2026-08-10",
    });
    expect(createCase.mock.calls[0]![0]).not.toHaveProperty("templateOperations");
    expect(wrapper.text()).not.toContain("案件を作成しますか?");
  });

  it("日付未設定: 画面Aでキャンセルすると createCase が呼ばれない（Req 3.1, 3.5）", async () => {
    const wrapper = mountForm();
    await flushPromises();

    await fillName(wrapper, "案件A");
    await setDates(wrapper, "", "");
    await submitForm(wrapper);

    expect(wrapper.text()).toContain("案件を作成しますか?");
    expect(createCase).not.toHaveBeenCalled();

    await buttonByText(wrapper, "戻る").trigger("click");
    await flushPromises();

    expect(createCase).not.toHaveBeenCalled();
    expect(wrapper.emitted("created")).toBeUndefined();
  });

  it("開始日のみ未設定: 承認して createCase を呼び出し、ops を省略する（Req 3.2, 3.5）", async () => {
    createCase.mockResolvedValue(
      makeCase({ startDate: null, endDate: "2026-08-10" }),
    );
    const wrapper = mountForm();
    await flushPromises();

    await fillName(wrapper, "案件A");
    await setDates(wrapper, "", "2026-08-10");
    await submitForm(wrapper);

    expect(createCase).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("開始日が未設定です");

    await buttonByText(wrapper, "作成する").trigger("click");
    await flushPromises();
    await nextTick();

    expect(createCase).toHaveBeenCalledTimes(1);
    expect(createCase).toHaveBeenCalledWith({
      name: "案件A",
      endDate: "2026-08-10",
    });
    expect(createCase.mock.calls[0]![0]).not.toHaveProperty("templateOperations");
    expect(wrapper.emitted("created")).toEqual([
      [expect.objectContaining({ id: "c1" })],
    ]);
  });

  it("作成後、連携失敗で案件を保持し、再試行を許可する（Req 3.x + 既存の再試行）", async () => {
    const task = makeTask({ id: "t-fail", title: "失敗タスク" });
    listTasks.mockResolvedValue([task]);
    createCase.mockResolvedValue(makeCase());
    updateTask.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(task);

    const wrapper = mountForm();
    await flushPromises();

    await fillName(wrapper, "案件A");
    await setDates(wrapper, "2026-08-01", "2026-08-10");

    // タスクを選択
    await wrapper.get('button[aria-label="失敗タスク を選択"]').trigger("click");
    await submitForm(wrapper);

    expect(createCase).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("created")).toHaveLength(1);
    expect(wrapper.text()).toContain("失敗タスク");
    expect(wrapper.findAll("button").some((b) => b.text().trim() === "再試行")).toBe(true);

    await buttonByText(wrapper, "再試行").trigger("click");
    await flushPromises();

    expect(updateTask).toHaveBeenCalledTimes(2);
    expect(updateTask).toHaveBeenLastCalledWith("t-fail", {
      caseId: "c1",
      isRequiredForCase: false,
    });
    expect(wrapper.emitted("close")).toBeTruthy();
  });
});

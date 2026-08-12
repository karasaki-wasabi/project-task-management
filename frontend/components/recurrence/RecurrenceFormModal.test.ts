// Mount tests for RecurrenceFormModal (task 7.1):
// create-only register with 4 anchors, non-neg offset, no fixed_interval fields.
// Requirements 1.3, 2.1, 2.2, 2.4, 2.5, 8.2, 8.3.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import RecurrenceFormModal from "./RecurrenceFormModal.vue";
import type { RecurringTaskTemplate } from "../../composables/useApiClient";

const registerRecurringTemplate = vi.fn();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      registerRecurringTemplate,
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

function makeTemplate(overrides: Partial<RecurringTaskTemplate> = {}): RecurringTaskTemplate {
  return {
    id: "rt1",
    title: "納品前最終確認",
    priority: "high",
    caseAnchor: "case_end",
    caseOffsetDays: 14,
    defaultDetail: "チェック",
    nonBusinessDayPolicy: "next_business_day",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mountForm(props: { open?: boolean } = {}) {
  return mount(RecurrenceFormModal, {
    props: { open: props.open ?? true },
    global: {
      stubs: {
        Modal: ModalStub,
        ErrorAlert: ErrorAlertStub,
      },
    },
  });
}

function buttonByText(wrapper: ReturnType<typeof mountForm>, text: string) {
  const match = wrapper.findAll("button").find((b) => b.text().trim() === text);
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

describe("RecurrenceFormModal (task 7.1)", () => {
  beforeEach(() => {
    registerRecurringTemplate.mockReset();
    registerRecurringTemplate.mockResolvedValue(makeTemplate());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes case-relative fields and no fixed-interval controls (Req 1.3, 2.1, 2.2, 2.4, 2.5)", async () => {
    const wrapper = mountForm();
    await flushPromises();

    expect(wrapper.get('[data-testid="modal-title"]').text()).toContain("案件連動テンプレートを登録");
    expect(wrapper.find("#recurrence-form-title").exists()).toBe(true);
    expect(wrapper.find("#recurrence-form-priority").exists()).toBe(true);
    expect(wrapper.find("#recurrence-form-case-anchor").exists()).toBe(true);
    expect(wrapper.find("#recurrence-form-offset").exists()).toBe(true);
    expect(wrapper.find("#recurrence-form-policy").exists()).toBe(true);
    expect(wrapper.find("#recurrence-form-default-detail").exists()).toBe(true);

    const anchorText = wrapper.get("#recurrence-form-case-anchor").text();
    expect(anchorText).toContain("案件開始日");
    expect(anchorText).toContain("案件終了日");
    expect(anchorText).toContain("案件期間内の各月初");
    expect(anchorText).toContain("案件期間内の各月末");

    const html = wrapper.html();
    expect(html).not.toMatch(/fixed_interval|intervalUnit|intervalValue|generateDue|今すぐ生成|固定間隔/);
    expect(wrapper.find('input[type="number"]').attributes("min")).toBe("0");
  });

  it("registers via registerRecurringTemplate and emits created + close (Req 2.1, 2.2, 2.4, 2.5)", async () => {
    const created = makeTemplate({ id: "rt-new", title: "キックオフ準備" });
    registerRecurringTemplate.mockResolvedValue(created);
    const wrapper = mountForm();
    await flushPromises();

    await wrapper.get("#recurrence-form-title").setValue("キックオフ準備");
    await wrapper.get("#recurrence-form-priority").setValue("medium");
    await wrapper.get("#recurrence-form-case-anchor").setValue("case_start");
    await wrapper.get("#recurrence-form-offset").setValue("3");
    await wrapper.get("#recurrence-form-policy").setValue("as_is");
    await wrapper.get("#recurrence-form-default-detail").setValue("議事録テンプレ");

    await wrapper.get("#recurrence-form").trigger("submit");
    await flushPromises();
    await nextTick();

    expect(registerRecurringTemplate).toHaveBeenCalledTimes(1);
    expect(registerRecurringTemplate).toHaveBeenCalledWith({
      title: "キックオフ準備",
      priority: "medium",
      caseAnchor: "case_start",
      caseOffsetDays: 3,
      nonBusinessDayPolicy: "as_is",
      defaultDetail: "議事録テンプレ",
    });
    expect(wrapper.emitted("created")?.[0]).toEqual([created]);
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("rejects negative offset without calling the API (Req 2.2)", async () => {
    const wrapper = mountForm();
    await flushPromises();

    await wrapper.get("#recurrence-form-title").setValue("検収");
    await wrapper.get("#recurrence-form-offset").setValue("-1");
    await wrapper.get("#recurrence-form").trigger("submit");
    await flushPromises();

    expect(registerRecurringTemplate).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="error-alert"]').text()).toMatch(/オフセット/);
  });
});

// Mount tests for RecurrenceDetailModal (task 7.1):
// view + stop/resume toggle + inline delete confirm (no window.confirm).
// Requirements 2.6, 2.7, 2.8, 8.2, 8.3.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import RecurrenceDetailModal from "./RecurrenceDetailModal.vue";
import type { RecurringTaskTemplate } from "../../composables/useApiClient";

const listRecurringTemplates = vi.fn();
const stopRecurringTemplate = vi.fn();
const resumeRecurringTemplate = vi.fn();
const deleteRecurringTemplate = vi.fn();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listRecurringTemplates,
      stopRecurringTemplate,
      resumeRecurringTemplate,
      deleteRecurringTemplate,
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

const BadgeStub = defineComponent({
  name: "Badge",
  props: {
    tone: { type: String, required: true },
    label: { type: String, required: true },
  },
  template: `<span data-testid="badge">{{ label }}</span>`,
});

function makeTemplate(overrides: Partial<RecurringTaskTemplate> = {}): RecurringTaskTemplate {
  return {
    id: "rt1",
    title: "納品前最終確認",
    priority: "high",
    caseAnchor: "case_end",
    caseOffsetDays: 14,
    defaultDetail: "顧客提出前に成果物一式をチェック",
    nonBusinessDayPolicy: "next_business_day",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mountDetail(templateId: string | null = "rt1") {
  return mount(RecurrenceDetailModal, {
    props: { templateId },
    global: {
      stubs: {
        Modal: ModalStub,
        ErrorAlert: ErrorAlertStub,
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

describe("RecurrenceDetailModal (task 7.1)", () => {
  beforeEach(() => {
    listRecurringTemplates.mockReset();
    stopRecurringTemplate.mockReset();
    resumeRecurringTemplate.mockReset();
    deleteRecurringTemplate.mockReset();
    listRecurringTemplates.mockResolvedValue([makeTemplate()]);
    stopRecurringTemplate.mockResolvedValue(undefined);
    resumeRecurringTemplate.mockResolvedValue(undefined);
    deleteRecurringTemplate.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockImplementation(() => {
      throw new Error("window.confirm must not be used");
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("loads template and shows view fields without fixed-interval controls", async () => {
    const wrapper = mountDetail();
    await flushPromises();

    expect(listRecurringTemplates).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="modal-title"]').text()).toContain("納品前最終確認");
    expect(wrapper.text()).toContain("有効");
    expect(wrapper.text()).toContain("案件終了日の14日前");
    expect(wrapper.text()).toContain("次営業日に登録");
    expect(wrapper.text()).toContain("高");
    expect(wrapper.text()).toContain("顧客提出前に成果物一式をチェック");
    expect(wrapper.html()).not.toMatch(/fixed_interval|intervalUnit|今すぐ生成|固定間隔/);
  });

  it("stops an active template via toggle (Req 2.6)", async () => {
    const wrapper = mountDetail();
    await flushPromises();

    const toggle = wrapper.get('[data-testid="active-toggle"]');
    expect(toggle.attributes("aria-checked")).toBe("true");
    await toggle.trigger("click");
    await flushPromises();
    await nextTick();

    expect(stopRecurringTemplate).toHaveBeenCalledWith("rt1");
    expect(resumeRecurringTemplate).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="badge"]').text()).toBe("停止中");
    expect(wrapper.get('[data-testid="active-toggle"]').attributes("aria-checked")).toBe("false");
    expect(wrapper.emitted("updated")?.[0]?.[0]).toMatchObject({ id: "rt1", isActive: false });
  });

  it("resumes a stopped template via toggle (Req 2.7)", async () => {
    listRecurringTemplates.mockResolvedValue([makeTemplate({ isActive: false })]);
    const wrapper = mountDetail();
    await flushPromises();

    expect(wrapper.get('[data-testid="badge"]').text()).toBe("停止中");
    await wrapper.get('[data-testid="active-toggle"]').trigger("click");
    await flushPromises();
    await nextTick();

    expect(resumeRecurringTemplate).toHaveBeenCalledWith("rt1");
    expect(stopRecurringTemplate).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="badge"]').text()).toBe("有効");
    expect(wrapper.emitted("updated")?.[0]?.[0]).toMatchObject({ id: "rt1", isActive: true });
  });

  it("deletes with inline confirm step, not window.confirm (Req 2.8)", async () => {
    const wrapper = mountDetail();
    await flushPromises();

    await buttonByText(wrapper, "削除").trigger("click");
    await nextTick();
    expect(wrapper.text()).toContain("本当に削除しますか?");
    expect(deleteRecurringTemplate).not.toHaveBeenCalled();

    await buttonByText(wrapper, "削除する").trigger("click");
    await flushPromises();

    expect(deleteRecurringTemplate).toHaveBeenCalledWith("rt1");
    expect(wrapper.emitted("deleted")?.[0]).toEqual([{ id: "rt1", title: "納品前最終確認" }]);
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

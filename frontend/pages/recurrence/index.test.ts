// Mount tests for RecurrencePage (task 7.3): template-only list + modals.
// Proves: no holiday / fixed_interval controls; create/detail modals open;
// list renders case-relative API fields. Requirements 1.3, 7.1, 7.2, 8.1–8.3.
// workspace-resource-scope task 7.2: empty state when currentId is null (Req 2.1, 2.2).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { RecurringTaskTemplate } from "../../composables/useApiClient";
import RecurrencePage from "./index.vue";

const listRecurringTemplates = vi.fn();
const currentId = ref<string | null>("ws-1");

vi.mock("../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({ currentId }),
}));

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listRecurringTemplates,
    }),
  };
});

const BadgeStub = defineComponent({
  name: "Badge",
  props: {
    tone: { type: String, required: true },
    label: { type: String, required: true },
  },
  template: `<span data-testid="badge" :data-tone="tone">{{ label }}</span>`,
});

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<div data-testid="error-alert">{{ message }}</div>`,
});

const NuxtLinkStub = defineComponent({
  name: "NuxtLink",
  props: { to: { type: [String, Object], required: true } },
  template: `<a :href="typeof to === 'string' ? to : '#'" data-testid="nuxt-link"><slot /></a>`,
});

const RecurrenceFormModalStub = defineComponent({
  name: "RecurrenceFormModal",
  props: { open: { type: Boolean, required: true } },
  emits: ["close", "created"],
  template: `<div v-if="open" data-testid="recurrence-form-modal" />`,
});

const RecurrenceDetailModalStub = defineComponent({
  name: "RecurrenceDetailModal",
  props: { templateId: { type: String, default: null } },
  emits: ["close", "updated", "deleted"],
  template: `<div v-if="templateId" data-testid="recurrence-detail-modal" :data-template-id="templateId" />`,
});

function makeTemplate(overrides: Partial<RecurringTaskTemplate> = {}): RecurringTaskTemplate {
  return {
    id: "rt1",
    title: "納品前最終確認",
    priority: "high",
    caseAnchor: "case_end",
    caseOffsetDays: 14,
    defaultMemo: "チェック",
    nonBusinessDayPolicy: "next_business_day",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buttonByText(wrapper: ReturnType<typeof mountPage>, text: string) {
  const match = wrapper.findAll("button").find((b) => b.text().trim() === text);
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

function mountPage() {
  return mount(RecurrencePage, {
    global: {
      stubs: {
        Badge: BadgeStub,
        ErrorAlert: ErrorAlertStub,
        NuxtLink: NuxtLinkStub,
        RecurrenceFormModal: RecurrenceFormModalStub,
        RecurrenceDetailModal: RecurrenceDetailModalStub,
      },
    },
  });
}

describe("RecurrencePage (task 7.3)", () => {
  beforeEach(() => {
    listRecurringTemplates.mockReset();
    currentId.value = "ws-1";
    listRecurringTemplates.mockResolvedValue([
      makeTemplate(),
      makeTemplate({
        id: "rt2",
        title: "キックオフ準備",
        caseAnchor: "case_start",
        caseOffsetDays: 0,
        nonBusinessDayPolicy: "as_is",
        isActive: false,
      }),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads templates on mount and lists case-relative fields (Req 8.1, 8.3)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listRecurringTemplates).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("繰り返し設定");
    expect(wrapper.text()).toContain("納品前最終確認");
    expect(wrapper.text()).toContain("案件終了日の14日前");
    expect(wrapper.text()).toContain("次営業日に登録");
    expect(wrapper.text()).toContain("キックオフ準備");
    expect(wrapper.text()).toContain("案件開始日当日");
    expect(wrapper.text()).toContain("そのまま登録");

    const badges = wrapper.findAll("[data-testid='badge']").map((n) => n.text());
    expect(badges).toEqual(["有効", "停止中"]);
  });

  it("opens the create modal from the primary CTA (Req 8.2, 8.3)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find("[data-testid='recurrence-form-modal']").exists()).toBe(false);
    await buttonByText(wrapper, "テンプレートを登録").trigger("click");
    await nextTick();

    expect(wrapper.find("[data-testid='recurrence-form-modal']").exists()).toBe(true);
  });

  it("opens the detail modal when a list row is activated (Req 8.2, 8.3)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find("[data-testid='recurrence-detail-modal']").exists()).toBe(false);
    await wrapper.get('[data-testid="template-row-rt1"]').trigger("click");
    await nextTick();

    const detail = wrapper.get("[data-testid='recurrence-detail-modal']");
    expect(detail.attributes("data-template-id")).toBe("rt1");
  });

  it("does not expose holiday management controls (Req 7.1, 7.2)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).not.toContain("非営業日マスタ");
    expect(wrapper.text()).not.toContain("休日マスタ");
    expect(wrapper.text()).not.toContain("祝日を取得");
    expect(wrapper.find("#holiday-date").exists()).toBe(false);
    expect(wrapper.find('input[type="date"]').exists()).toBe(false);
  });

  it("does not expose fixed_interval or generate-due controls (Req 1.3)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).not.toContain("固定間隔");
    expect(wrapper.text()).not.toContain("今すぐ生成");
    expect(wrapper.text()).not.toContain("間隔");
    expect(wrapper.html()).not.toMatch(/fixed_interval|intervalUnit|intervalValue|generateDue|generate-due/i);
  });

  it("ワークスペース未選択時は空状態を表示し一覧・作成導線を出さない（workspace-resource-scope Req 2.1, 2.2）", async () => {
    currentId.value = null;
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("ワークスペースがありません");
    expect(wrapper.text()).toContain("ワークスペースを作成");
    expect(wrapper.text()).not.toContain("テンプレートを登録");
    expect(listRecurringTemplates).not.toHaveBeenCalled();
    expect(wrapper.find('a[href="/workspaces"]').exists()).toBe(true);
  });
});

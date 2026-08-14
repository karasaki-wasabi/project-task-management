// Mount tests for ThroughputPage (velocity-dashboard 4.5).
// Requirements 4.1-4.3, 5.1-5.2, 6.3, 7.1-7.6. No workspace-empty-state.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Case, CaseOutlook, ThroughputSummary } from "../../../../composables/useApiClient";
import ThroughputPage from "./index.vue";

const getThroughput = vi.fn();
const listCases = vi.fn();
const currentId = ref<string | null>("ws-1");

vi.mock("../../../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({ currentId }),
}));

vi.mock("../../../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      getThroughput,
      listCases,
    }),
  };
});

const NuxtLinkStub = defineComponent({
  name: "NuxtLink",
  props: { to: { type: [String, Object], required: true } },
  template: `<a :href="typeof to === 'string' ? to : '#'"><slot /></a>`,
});

const ThroughputTrendChartStub = defineComponent({
  name: "ThroughputTrendChart",
  props: { periods: { type: Array, required: true } },
  template: `<div data-testid="throughput-trend-chart" />`,
});

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: "case-1",
    name: "Alpha案件",
    endDate: "2026-12-31T00:00:00.000Z",
    isCompleted: false,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeOutlook(overrides: Partial<CaseOutlook> = {}): CaseOutlook {
  return {
    openTaskCount: 23,
    openPoints: 68,
    requiredPeriods: 3,
    remainingPeriods: 6,
    marginPoints: 94,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<ThroughputSummary> = {}): ThroughputSummary {
  return {
    periods: [
      {
        periodStart: "2026-08-03T00:00:00.000Z",
        periodEnd: "2026-08-09T23:59:59.999Z",
        completedCount: 3,
        completedPoints: 8,
      },
    ],
    forecastNextPeriodCount: 2,
    forecastNextPeriodPoints: 5,
    ...overrides,
  };
}

function mountPage() {
  return mount(ThroughputPage, {
    global: {
      stubs: {
        NuxtLink: NuxtLinkStub,
        ThroughputTrendChart: ThroughputTrendChartStub,
      },
    },
  });
}

describe("ThroughputPage (velocity-dashboard 4.5)", () => {
  beforeEach(() => {
    getThroughput.mockReset();
    listCases.mockReset();
    currentId.value = "ws-1";
    getThroughput.mockResolvedValue(makeSummary());
    listCases.mockResolvedValue([makeCase()]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("現在ワークスペースがあるとき消化数を読み込む", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(getThroughput).toHaveBeenCalledTimes(1);
    expect(getThroughput).toHaveBeenCalledWith("week", 4);
    expect(listCases).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("消化数ダッシュボード");
    expect(wrapper.find('[data-testid="throughput-trend-chart"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="case-outlook-panel"]').exists()).toBe(false);
  });

  it("scoped 配下では未選択空状態を出さない（workspace-url-routing 3.2）", async () => {
    currentId.value = null;
    const mod = await import("./index.vue");
    const wrapper = mount(mod.default, {
      global: {
        stubs: {
          NuxtLink: NuxtLinkStub,
          ThroughputTrendChart: ThroughputTrendChartStub,
        },
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(false);
  });

  it("案件を選択すると caseId 付きで再取得し見通しパネルを表示する", async () => {
    getThroughput
      .mockResolvedValueOnce(makeSummary())
      .mockResolvedValueOnce(makeSummary({ caseOutlook: makeOutlook() }));

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-testid="case-outlook-panel"]').exists()).toBe(false);

    await wrapper.get('[data-testid="case-filter-trigger"]').trigger("click");
    await nextTick();
    const caseOption = wrapper
      .findAll('[role="option"]')
      .find((el) => el.text().includes("Alpha案件"));
    expect(caseOption).toBeTruthy();
    await caseOption!.trigger("click");
    await flushPromises();

    expect(getThroughput).toHaveBeenLastCalledWith("week", 4, "case-1");
    expect(wrapper.find('[data-testid="case-outlook-panel"]').exists()).toBe(true);
  });

  it("案件選択を解除すると caseId なしで再取得し見通しパネルを隠す", async () => {
    getThroughput
      .mockResolvedValueOnce(makeSummary())
      .mockResolvedValueOnce(makeSummary({ caseOutlook: makeOutlook() }))
      .mockResolvedValueOnce(makeSummary());

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="case-filter-trigger"]').trigger("click");
    await nextTick();
    await wrapper
      .findAll('[role="option"]')
      .find((el) => el.text().includes("Alpha案件"))!
      .trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="case-outlook-panel"]').exists()).toBe(true);

    await wrapper.get('[data-testid="case-filter-trigger"]').trigger("click");
    await nextTick();
    await wrapper
      .findAll('[role="option"]')
      .find((el) => el.text().includes("全体(ワークスペース)"))!
      .trigger("click");
    await flushPromises();

    expect(getThroughput).toHaveBeenLastCalledWith("week", 4);
    expect(wrapper.find('[data-testid="case-outlook-panel"]').exists()).toBe(false);
  });

  it("ワークスペース切替時は案件選択をクリアし caseId なしで再取得する", async () => {
    getThroughput
      .mockResolvedValueOnce(makeSummary())
      .mockResolvedValueOnce(makeSummary({ caseOutlook: makeOutlook() }))
      .mockResolvedValueOnce(makeSummary());
    listCases
      .mockResolvedValueOnce([makeCase()])
      .mockResolvedValueOnce([makeCase({ id: "case-2", name: "Beta案件" })]);

    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="case-filter-trigger"]').trigger("click");
    await nextTick();
    await wrapper
      .findAll('[role="option"]')
      .find((el) => el.text().includes("Alpha案件"))!
      .trigger("click");
    await flushPromises();
    expect(getThroughput).toHaveBeenLastCalledWith("week", 4, "case-1");
    expect(wrapper.find('[data-testid="case-outlook-panel"]').exists()).toBe(true);

    currentId.value = "ws-2";
    await flushPromises();

    expect(getThroughput).toHaveBeenLastCalledWith("week", 4);
    expect(wrapper.find('[data-testid="case-outlook-panel"]').exists()).toBe(false);
  });
});

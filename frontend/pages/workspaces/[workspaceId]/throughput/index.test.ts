// Mount tests for ThroughputPage empty state (workspace-resource-scope task 7.2).
// Requirements 2.1, 2.2. API scoping is out of this spec (velocity-dashboard).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { ThroughputSummary } from "../../../../composables/useApiClient";
import ThroughputPage from "./index.vue";

const getThroughput = vi.fn();
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
    }),
  };
});

const NuxtLinkStub = defineComponent({
  name: "NuxtLink",
  props: { to: { type: [String, Object], required: true } },
  template: `<a :href="typeof to === 'string' ? to : '#'"><slot /></a>`,
});

function makeSummary(overrides: Partial<ThroughputSummary> = {}): ThroughputSummary {
  return {
    periods: [
      {
        periodStart: "2026-08-03T00:00:00.000Z",
        periodEnd: "2026-08-09T23:59:59.999Z",
        completedCount: 3,
        completedPoints: 0,
      },
    ],
    forecastNextPeriodCount: 2,
    forecastNextPeriodPoints: null,
    ...overrides,
  };
}

function mountPage() {
  return mount(ThroughputPage, {
    global: {
      stubs: { NuxtLink: NuxtLinkStub },
    },
  });
}

describe("ThroughputPage (workspace-resource-scope task 7.2)", () => {
  beforeEach(() => {
    getThroughput.mockReset();
    currentId.value = "ws-1";
    getThroughput.mockResolvedValue(makeSummary());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("現在ワークスペースがあるとき消化数を読み込む", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(getThroughput).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("消化数ダッシュボード");
  });


  it("scoped 配下では未選択空状態を出さない（workspace-url-routing 3.2）", async () => {
    currentId.value = null;
    const mod = await import("./index.vue");
    const wrapper = mount(mod.default);
    await flushPromises();
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(false);
  });
});

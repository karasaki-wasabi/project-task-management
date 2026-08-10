// Mount tests for ThroughputPage empty state (workspace-resource-scope task 7.2).
// Requirements 2.1, 2.2. API scoping is out of this spec (velocity-dashboard).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { ThroughputSummary } from "../../composables/useApiClient";
import ThroughputPage from "./index.vue";

const getThroughput = vi.fn();
const currentId = ref<string | null>("ws-1");

vi.mock("../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({ currentId }),
}));

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
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
      },
    ],
    forecastNextPeriodCount: 2,
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

  it("ワークスペース未選択時は空状態を表示し集計取得しない（Req 2.1, 2.2）", async () => {
    currentId.value = null;
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("ワークスペースがありません");
    expect(wrapper.text()).toContain("ワークスペースを作成");
    expect(wrapper.text()).not.toContain("消化数ダッシュボード");
    expect(getThroughput).not.toHaveBeenCalled();
    expect(wrapper.find('a[href="/workspaces"]').exists()).toBe(true);
  });
});

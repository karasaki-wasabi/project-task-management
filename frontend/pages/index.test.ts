// Mount tests for home dashboard empty state (workspace-resource-scope task 7.2).
// Requirements 2.1, 2.2.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Case, CaseProgress } from "../composables/useApiClient";
import HomePage from "./index.vue";

const listCases = vi.fn();
const getCaseProgress = vi.fn();
const currentId = ref<string | null>("ws-1");

vi.mock("../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({ currentId }),
}));

vi.mock("../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listCases,
      getCaseProgress,
    }),
  };
});

const NuxtLinkStub = defineComponent({
  name: "NuxtLink",
  props: { to: { type: [String, Object], required: true } },
  template: `<a :href="typeof to === 'string' ? to : '#'"><slot /></a>`,
});

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: "c1",
    name: "案件A",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-01-31T00:00:00.000Z",
    isCompleted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeProgress(overrides: Partial<CaseProgress> = {}): CaseProgress {
  return {
    requiredTotal: 2,
    requiredCompleted: 0,
    requiredIncomplete: 2,
    isOverdueWithIncomplete: true,
    ...overrides,
  };
}

function mountPage() {
  return mount(HomePage, {
    global: {
      stubs: { NuxtLink: NuxtLinkStub },
    },
  });
}

describe("HomePage (workspace-resource-scope task 7.2)", () => {
  beforeEach(() => {
    listCases.mockReset();
    getCaseProgress.mockReset();
    currentId.value = "ws-1";
    listCases.mockResolvedValue([makeCase()]);
    getCaseProgress.mockResolvedValue(makeProgress());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("現在ワークスペースがあるとき期限超過案件を読み込む", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listCases).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("ダッシュボード");
    expect(wrapper.text()).toContain("案件A");
  });

  it("ワークスペース未選択時は空状態を表示し一覧取得しない（Req 2.1, 2.2）", async () => {
    currentId.value = null;
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("ワークスペースがありません");
    expect(wrapper.text()).toContain("ワークスペースを作成");
    expect(wrapper.text()).not.toContain("ダッシュボード");
    expect(listCases).not.toHaveBeenCalled();
    expect(wrapper.find('a[href="/workspaces"]').exists()).toBe(true);
  });
});

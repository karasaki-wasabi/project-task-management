// Mount tests for scoped dashboard (workspace-url-routing task 3.1).
// Overdue-cases body moved from pages/index; empty-state removed (middleware).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Case, CaseProgress } from "../../../composables/useApiClient";
import DashboardPage from "./index.vue";

const listCases = vi.fn();
const getCaseProgress = vi.fn();
const currentId = ref<string | null>("ws-1");

vi.mock("../../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({ currentId }),
}));

vi.mock("../../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../composables/useApiClient")>();
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
  return mount(DashboardPage, {
    global: {
      stubs: { NuxtLink: NuxtLinkStub },
    },
  });
}

describe("DashboardPage scoped (workspace-url-routing task 3.1)", () => {
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

  it("期限超過案件を読み込みダッシュボードを表示する", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listCases).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("ダッシュボード");
    expect(wrapper.text()).toContain("案件A");
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(false);
  });

  it("案件リンクは scoped tasks path を指す", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('a[href="/workspaces/ws-1/tasks?caseId=c1"]').exists()).toBe(true);
  });
});

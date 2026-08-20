import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Workspace } from "../composables/useApiClient";
import LandingPage from "./index.vue";

const refresh = vi.fn();
const navigateTo = vi.fn();
const currentId = ref<string | null>(null);
const workspaces = ref<Workspace[]>([]);

vi.mock("../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaces,
    currentId,
    refresh,
  }),
}));

const WorkspacePickerPanelStub = defineComponent({
  name: "WorkspacePickerPanel",
  template: `<div data-testid="workspace-picker-panel">picker</div>`,
});

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    name: "Alpha",
    color: "#2563eb",
    createdByUserId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function mountPage() {
  return mount(LandingPage, {
    global: {
      stubs: { WorkspacePickerPanel: WorkspacePickerPanelStub },
    },
  });
}

describe("LandingPage (workspace-url-routing task 3.1)", () => {
  beforeEach(() => {
    refresh.mockReset();
    navigateTo.mockReset();
    currentId.value = null;
    workspaces.value = [];
    refresh.mockImplementation(async () => {
      /* currentId / workspaces set by each test before mount or inside mock */
    });
    vi.stubGlobal("navigateTo", navigateTo);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("前回利用 WS が有効なときダッシュボードへ navigate する（Req 2.1）", async () => {
    refresh.mockImplementation(async () => {
      workspaces.value = [makeWorkspace()];
      currentId.value = "ws-1";
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigateTo).toHaveBeenCalledWith("/workspaces/ws-1");
    expect(wrapper.find('[data-testid="workspace-picker-panel"]').exists()).toBe(false);
  });

  it("前回利用が無い／無効なとき Picker を表示する（Req 2.2）", async () => {
    refresh.mockImplementation(async () => {
      workspaces.value = [makeWorkspace({ id: "ws-other", name: "Other" })];
      currentId.value = null;
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigateTo).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="workspace-picker-panel"]').exists()).toBe(true);
  });

  it("所属ゼロでも Picker（作成導線）を表示する（Req 8.1）", async () => {
    refresh.mockImplementation(async () => {
      workspaces.value = [];
      currentId.value = null;
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(navigateTo).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="workspace-picker-panel"]').exists()).toBe(true);
  });

  it("refresh 後に currentId が有効になるとダッシュボードへ navigate する", async () => {
    refresh.mockResolvedValue(undefined);
    currentId.value = null;

    mountPage();
    await flushPromises();
    expect(navigateTo).not.toHaveBeenCalled();

    currentId.value = "ws-1";
    await flushPromises();

    expect(navigateTo).toHaveBeenCalledWith("/workspaces/ws-1");
  });
});

// Mount tests for WorkspaceSwitcher (task 6.2):
// current workspace display, switch dropdown, create-modal / manage links,
// and empty-state muted styling. Requirements 1.3, 2.1, 2.2, 2.3.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import WorkspaceSwitcher from "./WorkspaceSwitcher.vue";
import type { Workspace } from "../../composables/useApiClient";

const refresh = vi.fn();
const select = vi.fn();
const navigateTo = vi.fn();
const currentId = ref<string | null>(null);
const workspaces = ref<Workspace[]>([]);
const route = { path: "/workspaces", query: {} as Record<string, string> };

vi.mock("../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaces,
    currentId,
    refresh,
    select,
  }),
}));

vi.stubGlobal("navigateTo", navigateTo);
vi.stubGlobal("useRoute", () => route);

const WorkspaceCreateModalStub = defineComponent({
  name: "WorkspaceCreateModal",
  props: { open: { type: Boolean, required: true } },
  emits: ["close", "created"],
  template: `
    <div v-if="open" data-testid="workspace-create-modal">
      <button type="button" data-testid="modal-close" @click="$emit('close')">close</button>
    </div>
  `,
});

const NuxtLinkStub = defineComponent({
  name: "NuxtLink",
  props: { to: { type: [String, Object], required: true } },
  template: `<a :href="typeof to === 'string' ? to : '#'" data-testid="nuxt-link"><slot /></a>`,
});

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    name: "営業チーム",
    color: "#2563eb",
    createdByUserId: "user-1",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

function mountSwitcher() {
  return mount(WorkspaceSwitcher, {
    global: {
      stubs: {
        WorkspaceCreateModal: WorkspaceCreateModalStub,
        NuxtLink: NuxtLinkStub,
      },
    },
  });
}

function buttonByText(wrapper: ReturnType<typeof mountSwitcher>, text: string | RegExp) {
  const match = wrapper.findAll("button").find((b) => {
    const t = b.text().trim();
    return typeof text === "string" ? t === text || t.includes(text) : text.test(t);
  });
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

describe("WorkspaceSwitcher (task 6.2)", () => {
  beforeEach(() => {
    refresh.mockReset();
    select.mockReset();
    navigateTo.mockReset();
    currentId.value = null;
    workspaces.value = [];
    route.path = "/workspaces";
    route.query = {};
    refresh.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("マウント時に所属一覧を refresh する", async () => {
    mountSwitcher();
    await flushPromises();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("未選択時は淡色の「ワークスペース未選択」を表示する（Req 2.3）", async () => {
    currentId.value = null;
    workspaces.value = [];
    const wrapper = mountSwitcher();
    await flushPromises();

    const trigger = wrapper.get('[data-testid="workspace-switcher-trigger"]');
    expect(trigger.text()).toContain("ワークスペース未選択");
    expect(trigger.classes().join(" ")).toMatch(/slate|text-slate|opacity|muted|gray/i);
    const emptyDot = wrapper.get('[data-testid="workspace-color-dot"]');
    expect(emptyDot.attributes("style") ?? emptyDot.classes().join(" ")).toMatch(
      /#9ca3af|#94a3b8|slate|gray/i,
    );
  });

  it("現在ワークスペースの識別色ドットと名前を表示する（Req 2.1）", async () => {
    const ws = makeWorkspace({ id: "ws-1", name: "営業チーム", color: "#2563eb" });
    workspaces.value = [ws];
    currentId.value = "ws-1";
    const wrapper = mountSwitcher();
    await flushPromises();

    const trigger = wrapper.get('[data-testid="workspace-switcher-trigger"]');
    expect(trigger.text()).toContain("営業チーム");
    expect(trigger.text()).toContain("▼");
    const dot = wrapper.get('[data-testid="workspace-color-dot"]');
    expect(dot.attributes("style")).toContain("#2563eb");
  });

  it("ドロップダウンから別ワークスペースを選ぶと select する（Req 2.2）", async () => {
    workspaces.value = [
      makeWorkspace({ id: "ws-1", name: "Alpha", color: "#2563eb" }),
      makeWorkspace({ id: "ws-2", name: "Beta", color: "#2563eb" }),
    ];
    currentId.value = "ws-1";
    const wrapper = mountSwitcher();
    await flushPromises();

    await wrapper.get('[data-testid="workspace-switcher-trigger"]').trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("ワークスペース");
    expect(wrapper.text()).toContain("Alpha");
    expect(wrapper.text()).toContain("Beta");

    await buttonByText(wrapper, "Beta").trigger("click");
    expect(select).toHaveBeenCalledWith("ws-2");
  });

  it("scoped 上では同一画面種のまま workspaceId を差し替えクエリを維持する（workspace-url-routing 4.2）", async () => {
    route.path = "/workspaces/ws-1/kanban";
    route.query = { caseId: "c1" };
    workspaces.value = [
      makeWorkspace({ id: "ws-1", name: "Alpha" }),
      makeWorkspace({ id: "ws-2", name: "Beta" }),
    ];
    currentId.value = "ws-1";
    const wrapper = mountSwitcher();
    await flushPromises();

    await wrapper.get('[data-testid="workspace-switcher-trigger"]').trigger("click");
    await nextTick();
    await buttonByText(wrapper, "Beta").trigger("click");

    expect(select).toHaveBeenCalledWith("ws-2");
    expect(navigateTo).toHaveBeenCalledWith({
      path: "/workspaces/ws-2/kanban",
      query: { caseId: "c1" },
    });
  });

  it("/ 上で選ぶとダッシュボードへ進む", async () => {
    route.path = "/";
    workspaces.value = [makeWorkspace({ id: "ws-2", name: "Beta" })];
    currentId.value = null;
    const wrapper = mountSwitcher();
    await flushPromises();

    await wrapper.get('[data-testid="workspace-switcher-trigger"]').trigger("click");
    await nextTick();
    await buttonByText(wrapper, "Beta").trigger("click");

    expect(navigateTo).toHaveBeenCalledWith("/workspaces/ws-2");
  });

  it("作成導線で WorkspaceCreateModal を開き、閉じられる（Req 1.3 導線）", async () => {
    workspaces.value = [makeWorkspace()];
    currentId.value = "ws-1";
    const wrapper = mountSwitcher();
    await flushPromises();

    await wrapper.get('[data-testid="workspace-switcher-trigger"]').trigger("click");
    await nextTick();
    await buttonByText(wrapper, /ワークスペースを作成/).trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="workspace-create-modal"]').exists()).toBe(true);

    await wrapper.get('[data-testid="modal-close"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="workspace-create-modal"]').exists()).toBe(false);
  });

  it("メンバー管理画面への導線を持つ", async () => {
    workspaces.value = [makeWorkspace()];
    currentId.value = "ws-1";
    const wrapper = mountSwitcher();
    await flushPromises();

    await wrapper.get('[data-testid="workspace-switcher-trigger"]').trigger("click");
    await nextTick();

    const manageLink = wrapper
      .findAll('[data-testid="nuxt-link"]')
      .find((a) => a.attributes("href") === "/workspaces");
    expect(manageLink).toBeTruthy();
    expect(manageLink!.text()).toMatch(/管理|メンバー/);
  });
});

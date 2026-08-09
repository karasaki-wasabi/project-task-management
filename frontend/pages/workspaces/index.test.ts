// Mount tests for WorkspacesPage (task 6.3): empty state + member list.
// Requirements 2.3, 3.1, 3.2.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Workspace, WorkspaceUserSummary } from "../../composables/useApiClient";
import WorkspacesPage from "./index.vue";

const refresh = vi.fn();
const select = vi.fn();
const currentId = ref<string | null>(null);
const workspaces = ref<Workspace[]>([]);

const listWorkspaceMembers = vi.fn();

vi.mock("../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaces,
    currentId,
    refresh,
    select,
  }),
}));

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listWorkspaceMembers,
    }),
  };
});

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

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<div data-testid="error-alert">{{ message }}</div>`,
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

function makeMember(overrides: Partial<WorkspaceUserSummary> = {}): WorkspaceUserSummary {
  return {
    userId: "u-1",
    name: "山田太郎",
    email: "yamada@example.com",
    ...overrides,
  };
}

function buttonByText(wrapper: ReturnType<typeof mountPage>, text: string | RegExp) {
  const match = wrapper.findAll("button").find((b) => {
    const t = b.text().trim();
    return typeof text === "string" ? t === text || t.includes(text) : text.test(t);
  });
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

function mountPage() {
  return mount(WorkspacesPage, {
    global: {
      stubs: {
        WorkspaceCreateModal: WorkspaceCreateModalStub,
        ErrorAlert: ErrorAlertStub,
      },
    },
  });
}

describe("WorkspacesPage (task 6.3)", () => {
  beforeEach(() => {
    refresh.mockReset();
    select.mockReset();
    listWorkspaceMembers.mockReset();
    currentId.value = null;
    workspaces.value = [];
    refresh.mockResolvedValue(undefined);
    listWorkspaceMembers.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("マウント時に所属一覧を refresh する", async () => {
    mountPage();
    await flushPromises();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("ワークスペース未選択時は空状態カードと作成 CTA を表示する（Req 2.3）", async () => {
    currentId.value = null;
    workspaces.value = [];
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("ワークスペースがありません");
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(true);
    expect(listWorkspaceMembers).not.toHaveBeenCalled();

    await buttonByText(wrapper, "ワークスペースを作成").trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="workspace-create-modal"]').exists()).toBe(true);
  });

  it("現在ワークスペースがあるとき見出し（色ドット＋名前）とメンバー一覧を表示する（Req 3.1, 3.2）", async () => {
    const ws = makeWorkspace();
    currentId.value = ws.id;
    workspaces.value = [ws];
    listWorkspaceMembers.mockResolvedValue([
      makeMember(),
      makeMember({ userId: "u-2", name: "佐藤花子", email: "sato@example.com" }),
    ]);

    const wrapper = mountPage();
    await flushPromises();

    expect(listWorkspaceMembers).toHaveBeenCalledWith("ws-1");
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(false);

    const heading = wrapper.get('[data-testid="workspace-heading"]');
    expect(heading.text()).toContain("営業チーム");
    const dot = wrapper.get('[data-testid="workspace-color-dot"]');
    expect(dot.attributes("style") ?? "").toContain("#2563eb");

    const names = wrapper.findAll('[data-testid="member-name"]').map((n) => n.text());
    const emails = wrapper.findAll('[data-testid="member-email"]').map((n) => n.text());
    expect(names).toEqual(["山田太郎", "佐藤花子"]);
    expect(emails).toEqual(["yamada@example.com", "sato@example.com"]);
    expect(wrapper.text()).toContain("メンバー 2人");
  });

  it("現在ワークスペースが切り替わるとメンバー一覧を再取得する", async () => {
    const ws1 = makeWorkspace({ id: "ws-1", name: "営業チーム" });
    const ws2 = makeWorkspace({ id: "ws-2", name: "開発チーム" });
    currentId.value = ws1.id;
    workspaces.value = [ws1, ws2];
    listWorkspaceMembers.mockImplementation(async (id: string) => {
      if (id === "ws-1") return [makeMember()];
      if (id === "ws-2") {
        return [makeMember({ userId: "u-3", name: "開発者", email: "dev@example.com" })];
      }
      return [];
    });

    const wrapper = mountPage();
    await flushPromises();
    expect(listWorkspaceMembers).toHaveBeenCalledWith("ws-1");

    currentId.value = ws2.id;
    await flushPromises();
    await nextTick();

    expect(listWorkspaceMembers).toHaveBeenCalledWith("ws-2");
    expect(wrapper.get('[data-testid="workspace-heading"]').text()).toContain("開発チーム");
    expect(wrapper.get('[data-testid="member-name"]').text()).toBe("開発者");
  });

  it("作成モーダルを閉じられる", async () => {
    currentId.value = null;
    const wrapper = mountPage();
    await flushPromises();

    await buttonByText(wrapper, "ワークスペースを作成").trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="workspace-create-modal"]').exists()).toBe(true);

    await wrapper.get('[data-testid="modal-close"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="workspace-create-modal"]').exists()).toBe(false);
  });
});

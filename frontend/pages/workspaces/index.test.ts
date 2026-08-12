// Mount tests for WorkspacesPage (tasks 6.3–6.6): empty state, member list,
// inline member-search add panel, settings, and creator-only delete.
// Requirements 2.3, 3.1, 3.2, 4.1–4.5, 6.1, 7.1–7.4.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import {
  WORKSPACE_COLORS,
  type PublicUser,
  type Workspace,
  type WorkspaceUserSummary,
} from "../../composables/useApiClient";
import WorkspacesPage from "./index.vue";

const refresh = vi.fn();
const select = vi.fn();
const relocateAfterWorkspaceLost = vi.fn();
const clearCurrentIf = vi.fn((id: string) => {
  if (currentId.value === id) {
    currentId.value = null;
  }
});
const currentId = ref<string | null>(null);
const workspaces = ref<Workspace[]>([]);
const authUser = ref<PublicUser | null>(null);

const listWorkspaceMembers = vi.fn();
const searchAddableWorkspaceUsers = vi.fn();
const addWorkspaceMember = vi.fn();
const deleteWorkspace = vi.fn();

vi.mock("../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaces,
    currentId,
    refresh,
    select,
    clearCurrentIf,
    relocateAfterWorkspaceLost,
  }),
}));

vi.mock("../../composables/useAuth", () => ({
  useAuth: () => ({ user: authUser }),
}));

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listWorkspaceMembers,
      searchAddableWorkspaceUsers,
      addWorkspaceMember,
      deleteWorkspace,
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

const WorkspaceSettingsModalStub = defineComponent({
  name: "WorkspaceSettingsModal",
  props: {
    open: { type: Boolean, required: true },
    workspace: { type: Object, required: false, default: null },
  },
  emits: ["close", "saved"],
  template: `
    <div v-if="open" data-testid="workspace-settings-modal">
      <button type="button" data-testid="settings-modal-close" @click="$emit('close')">close</button>
      <button
        type="button"
        data-testid="settings-modal-save"
        @click="$emit('saved', workspace); $emit('close')"
      >
        save
      </button>
    </div>
  `,
});

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<div data-testid="error-alert">{{ message }}</div>`,
});

const ModalStub = defineComponent({
  name: "Modal",
  props: {
    open: { type: Boolean, required: true },
    ariaLabel: { type: String, required: false },
  },
  emits: ["close"],
  template: `
    <div v-if="open" data-testid="workspace-delete-modal" role="dialog">
      <div data-testid="modal-title"><slot name="title" /></div>
      <div data-testid="modal-body"><slot /></div>
      <div data-testid="modal-actions"><slot name="actions" /></div>
      <button type="button" aria-label="閉じる" @click="$emit('close')">×</button>
    </div>
  `,
});

function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: "user-1",
    name: "作成者",
    email: "creator@example.com",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

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
        WorkspaceSettingsModal: WorkspaceSettingsModalStub,
        ErrorAlert: ErrorAlertStub,
        Modal: ModalStub,
      },
    },
  });
}

describe("WorkspacesPage (task 6.3)", () => {
  beforeEach(() => {
    refresh.mockReset();
    select.mockReset();
    clearCurrentIf.mockClear();
    relocateAfterWorkspaceLost.mockClear();
    listWorkspaceMembers.mockReset();
    searchAddableWorkspaceUsers.mockReset();
    addWorkspaceMember.mockReset();
    deleteWorkspace.mockReset();
    currentId.value = null;
    workspaces.value = [];
    authUser.value = makeUser();
    refresh.mockResolvedValue(undefined);
    listWorkspaceMembers.mockResolvedValue([]);
    searchAddableWorkspaceUsers.mockResolvedValue([]);
    addWorkspaceMember.mockResolvedValue(makeMember());
    deleteWorkspace.mockResolvedValue(undefined);
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

describe("WorkspacesPage settings modal (task 6.5)", () => {
  beforeEach(() => {
    refresh.mockReset();
    select.mockReset();
    listWorkspaceMembers.mockReset();
    searchAddableWorkspaceUsers.mockReset();
    addWorkspaceMember.mockReset();
    deleteWorkspace.mockReset();
    const ws = makeWorkspace();
    currentId.value = ws.id;
    workspaces.value = [ws];
    authUser.value = makeUser();
    refresh.mockResolvedValue(undefined);
    listWorkspaceMembers.mockResolvedValue([makeMember()]);
    searchAddableWorkspaceUsers.mockResolvedValue([]);
    addWorkspaceMember.mockResolvedValue(makeMember());
    deleteWorkspace.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("「設定」で設定モーダルを開き閉じられる（Req 6.1）", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-testid="workspace-settings-modal"]').exists()).toBe(false);

    await buttonByText(wrapper, "設定").trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="workspace-settings-modal"]').exists()).toBe(true);

    await wrapper.get('[data-testid="settings-modal-close"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="workspace-settings-modal"]').exists()).toBe(false);
  });

  it("設定保存後に見出しの名前・色が更新される（Req 6.1, 6.3）", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-testid="workspace-heading"]').text()).toContain("営業チーム");
    expect(wrapper.get('[data-testid="workspace-color-dot"]').attributes("style") ?? "").toContain(
      WORKSPACE_COLORS[0],
    );

    await buttonByText(wrapper, "設定").trigger("click");
    await nextTick();

    // Simulate WorkspaceSettingsModal save → refresh updating shared state.
    workspaces.value = [
      makeWorkspace({ name: "開発チーム", color: WORKSPACE_COLORS[1] }),
    ];
    await wrapper.get('[data-testid="settings-modal-save"]').trigger("click");
    await nextTick();
    await flushPromises();

    expect(wrapper.find('[data-testid="workspace-settings-modal"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="workspace-heading"]').text()).toContain("開発チーム");
    expect(wrapper.get('[data-testid="workspace-color-dot"]').attributes("style") ?? "").toContain(
      WORKSPACE_COLORS[1],
    );
  });
});

describe("WorkspacesPage member search add panel (task 6.4)", () => {
  beforeEach(() => {
    refresh.mockReset();
    select.mockReset();
    listWorkspaceMembers.mockReset();
    searchAddableWorkspaceUsers.mockReset();
    addWorkspaceMember.mockReset();
    deleteWorkspace.mockReset();
    const ws = makeWorkspace();
    currentId.value = ws.id;
    workspaces.value = [ws];
    authUser.value = makeUser();
    refresh.mockResolvedValue(undefined);
    listWorkspaceMembers.mockResolvedValue([makeMember()]);
    searchAddableWorkspaceUsers.mockResolvedValue([]);
    addWorkspaceMember.mockResolvedValue(
      makeMember({ userId: "u-new", name: "鈴木一郎", email: "suzuki@example.com" }),
    );
    deleteWorkspace.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("「メンバーを追加」でインライン検索パネルを展開する（Req 4.1）", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-testid="member-search-panel"]').exists()).toBe(false);

    await buttonByText(wrapper, "メンバーを追加").trigger("click");
    await nextTick();

    const panel = wrapper.get('[data-testid="member-search-panel"]');
    expect(panel.text()).toMatch(/既存メンバー/);
    const input = wrapper.get('[data-testid="member-search-input"]');
    expect(input.attributes("placeholder") ?? "").toContain("表示名またはメールアドレスで検索");
  });

  it("検索すると API 結果を一覧表示し、0件時は空表示する（Req 4.1, 4.2）", async () => {
    searchAddableWorkspaceUsers.mockResolvedValue([
      makeMember({ userId: "u-2", name: "佐藤花子", email: "sato@example.com" }),
    ]);

    const wrapper = mountPage();
    await flushPromises();
    await buttonByText(wrapper, "メンバーを追加").trigger("click");
    await nextTick();

    const input = wrapper.get('[data-testid="member-search-input"]');
    await input.setValue("佐藤");
    await input.trigger("input");
    await flushPromises();

    expect(searchAddableWorkspaceUsers).toHaveBeenCalledWith("ws-1", "佐藤");
    expect(wrapper.findAll('[data-testid="search-result-name"]').map((n) => n.text())).toEqual([
      "佐藤花子",
    ]);
    expect(wrapper.findAll('[data-testid="search-result-email"]').map((n) => n.text())).toEqual([
      "sato@example.com",
    ]);
    expect(wrapper.find('[data-testid="member-search-empty"]').exists()).toBe(false);

    searchAddableWorkspaceUsers.mockResolvedValue([]);
    await input.setValue("nobody");
    await input.trigger("input");
    await flushPromises();

    expect(wrapper.find('[data-testid="member-search-empty"]').text()).toContain(
      "該当するユーザーがいません。",
    );
    expect(wrapper.findAll('[data-testid="search-result-name"]')).toHaveLength(0);
  });

  it("行内の追加でメンバー一覧に即時反映し、再検索では追加済みが除外される（Req 4.2, 4.3）", async () => {
    const candidate = makeMember({
      userId: "u-2",
      name: "佐藤花子",
      email: "sato@example.com",
    });
    searchAddableWorkspaceUsers
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);

    listWorkspaceMembers
      .mockResolvedValueOnce([makeMember()])
      .mockResolvedValueOnce([
        makeMember(),
        makeMember({ userId: "u-2", name: "佐藤花子", email: "sato@example.com" }),
      ]);

    addWorkspaceMember.mockResolvedValue(candidate);

    const wrapper = mountPage();
    await flushPromises();
    expect(listWorkspaceMembers).toHaveBeenCalledTimes(1);

    await buttonByText(wrapper, "メンバーを追加").trigger("click");
    await nextTick();

    const input = wrapper.get('[data-testid="member-search-input"]');
    await input.setValue("佐藤");
    await input.trigger("input");
    await flushPromises();

    expect(wrapper.findAll('[data-testid="search-result-name"]')).toHaveLength(1);

    await wrapper.get('[data-testid="add-member-button"]').trigger("click");
    await flushPromises();

    expect(addWorkspaceMember).toHaveBeenCalledWith("ws-1", "u-2");
    expect(listWorkspaceMembers).toHaveBeenCalledTimes(2);

    const names = wrapper.findAll('[data-testid="member-name"]').map((n) => n.text());
    expect(names).toEqual(["山田太郎", "佐藤花子"]);
    expect(wrapper.text()).toContain("メンバー 2人");

    // Same query re-run (or retained query re-search) excludes the added member.
    expect(searchAddableWorkspaceUsers).toHaveBeenCalledTimes(2);
    expect(searchAddableWorkspaceUsers).toHaveBeenLastCalledWith("ws-1", "佐藤");
    expect(wrapper.findAll('[data-testid="search-result-name"]')).toHaveLength(0);
  });
});

describe("WorkspacesPage creator-only delete (task 6.6)", () => {
  beforeEach(() => {
    refresh.mockReset();
    select.mockReset();
    listWorkspaceMembers.mockReset();
    searchAddableWorkspaceUsers.mockReset();
    addWorkspaceMember.mockReset();
    deleteWorkspace.mockReset();
    const ws = makeWorkspace({ createdByUserId: "user-1" });
    currentId.value = ws.id;
    workspaces.value = [ws];
    authUser.value = makeUser({ id: "user-1" });
    refresh.mockResolvedValue(undefined);
    listWorkspaceMembers.mockResolvedValue([
      makeMember(),
      makeMember({ userId: "u-2", name: "佐藤花子", email: "sato@example.com" }),
    ]);
    searchAddableWorkspaceUsers.mockResolvedValue([]);
    addWorkspaceMember.mockResolvedValue(makeMember());
    deleteWorkspace.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("作成者にのみ削除ボタンを表示する（Req 7.1, 7.2）", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('[data-testid="workspace-delete-button"]').exists()).toBe(true);
    expect(buttonByText(wrapper, "ワークスペースを削除").exists()).toBe(true);

    authUser.value = makeUser({ id: "user-2", name: "メンバー", email: "member@example.com" });
    await nextTick();

    expect(wrapper.find('[data-testid="workspace-delete-button"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("ワークスペースを削除");
  });

  it("削除確認モーダルを経て削除し、現在選択を解除して空状態に戻る（Req 7.1, 7.4）", async () => {
    const wrapper = mountPage();
    await flushPromises();

    // After delete succeeds, subsequent refresh empties the membership list.
    refresh.mockImplementation(async () => {
      workspaces.value = [];
      if (currentId.value !== null && !workspaces.value.some((w) => w.id === currentId.value)) {
        currentId.value = null;
      }
    });

    await wrapper.get('[data-testid="workspace-delete-button"]').trigger("click");
    await nextTick();

    const modal = wrapper.get('[data-testid="workspace-delete-modal"]');
    expect(modal.text()).toContain("このワークスペースを削除しますか？");
    expect(modal.text()).toMatch(/メンバー\s*2人/);
    expect(modal.text()).not.toMatch(/案件/);

    expect(deleteWorkspace).not.toHaveBeenCalled();

    await buttonByText(wrapper, /^削除する$/).trigger("click");
    await flushPromises();

    expect(deleteWorkspace).toHaveBeenCalledWith("ws-1");
    expect(clearCurrentIf).toHaveBeenCalledWith("ws-1");
    expect(refresh).toHaveBeenCalled();
    expect(relocateAfterWorkspaceLost).toHaveBeenCalledWith("ws-1");
    expect(currentId.value).toBeNull();
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="workspace-delete-modal"]').exists()).toBe(false);
  });

  it("確認モーダルをキャンセルすると削除しない", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="workspace-delete-button"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="workspace-delete-modal"]').exists()).toBe(true);

    await buttonByText(wrapper, "キャンセル").trigger("click");
    await nextTick();

    expect(deleteWorkspace).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="workspace-delete-modal"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(false);
  });
});

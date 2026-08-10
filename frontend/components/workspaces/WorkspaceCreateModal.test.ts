// Mount tests for WorkspaceCreateModal (task 6.1):
// name input, empty-name error, create → refresh → select as current workspace.
// Requirements 1.1, 1.2, 1.3.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import WorkspaceCreateModal from "./WorkspaceCreateModal.vue";
import type { Workspace } from "../../composables/useApiClient";

const createWorkspace = vi.fn();
const refresh = vi.fn();
const select = vi.fn();
const currentId = ref<string | null>(null);
const workspaces = ref<Workspace[]>([]);

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      createWorkspace,
    }),
  };
});

vi.mock("../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaces,
    currentId,
    refresh,
    select,
  }),
}));

const ModalStub = defineComponent({
  name: "Modal",
  props: {
    open: { type: Boolean, required: true },
    ariaLabel: { type: String, required: false },
  },
  emits: ["close"],
  template: `
    <div v-if="open" data-testid="modal" role="dialog">
      <div data-testid="modal-title"><slot name="title" /></div>
      <div data-testid="modal-body"><slot /></div>
      <div data-testid="modal-actions"><slot name="actions" /></div>
      <button type="button" aria-label="閉じる" @click="$emit('close')">×</button>
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
    id: "ws-new",
    name: "新しいチーム",
    color: "#2563eb",
    createdByUserId: "user-1",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

function mountModal(props: { open?: boolean } = {}) {
  return mount(WorkspaceCreateModal, {
    props: { open: props.open ?? true },
    global: {
      stubs: {
        Modal: ModalStub,
        ErrorAlert: ErrorAlertStub,
      },
    },
  });
}

function buttonByText(wrapper: ReturnType<typeof mountModal>, text: string) {
  const match = wrapper.findAll("button").find((b) => b.text().trim() === text);
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}

/** happy-dom may not associate form= id submit buttons; submit the form node. */
async function submitForm(wrapper: ReturnType<typeof mountModal>) {
  await wrapper.get("#workspace-create-form").trigger("submit");
  await flushPromises();
  await nextTick();
}

describe("WorkspaceCreateModal (task 6.1)", () => {
  beforeEach(() => {
    createWorkspace.mockReset();
    refresh.mockReset();
    select.mockReset();
    currentId.value = null;
    workspaces.value = [];
    createWorkspace.mockResolvedValue(makeWorkspace());
    refresh.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("名前入力とヘルプ文を表示する（Req 1.1）", async () => {
    const wrapper = mountModal();
    await flushPromises();

    expect(wrapper.get('[data-testid="modal-title"]').text()).toContain("ワークスペースを作成");
    expect(wrapper.find("#workspace-create-name").exists()).toBe(true);
    expect(wrapper.text()).toContain("作成したユーザーが自動的に最初のメンバーになります。");
    expect(buttonByText(wrapper, "作成").exists()).toBe(true);
    expect(buttonByText(wrapper, "キャンセル").exists()).toBe(true);
  });

  it("未入力のまま作成するとエラーを表示し API を呼ばない（Req 1.2）", async () => {
    const wrapper = mountModal();
    await flushPromises();

    await submitForm(wrapper);

    expect(wrapper.get('[data-testid="error-alert"]').text()).toMatch(/ワークスペース名/);
    expect(createWorkspace).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it("空白のみの名前でもエラーを表示し API を呼ばない（Req 1.2）", async () => {
    const wrapper = mountModal();
    await flushPromises();

    await wrapper.get("#workspace-create-name").setValue("   ");
    await submitForm(wrapper);

    expect(wrapper.get('[data-testid="error-alert"]').text()).toMatch(/ワークスペース名/);
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it("作成成功後に一覧を refresh して新規ワークスペースを現在選択にする（Req 1.1, 1.3）", async () => {
    const created = makeWorkspace({ id: "ws-created", name: "営業チーム" });
    createWorkspace.mockResolvedValue(created);
    const callOrder: string[] = [];
    createWorkspace.mockImplementation(async () => {
      callOrder.push("create");
      return created;
    });
    refresh.mockImplementation(async () => {
      callOrder.push("refresh");
      workspaces.value = [created];
    });
    select.mockImplementation((id: string) => {
      callOrder.push("select");
      currentId.value = id;
    });

    const wrapper = mountModal();
    await flushPromises();
    await wrapper.get("#workspace-create-name").setValue("営業チーム");
    await submitForm(wrapper);

    expect(createWorkspace).toHaveBeenCalledWith({ name: "営業チーム" });
    expect(refresh).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith("ws-created");
    expect(callOrder).toEqual(["create", "refresh", "select"]);
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("キャンセルで close を emit する", async () => {
    const wrapper = mountModal();
    await flushPromises();

    await buttonByText(wrapper, "キャンセル").trigger("click");

    expect(wrapper.emitted("close")).toBeTruthy();
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it("open が true になったときフォームをリセットする", async () => {
    const wrapper = mountModal({ open: true });
    await flushPromises();
    await wrapper.get("#workspace-create-name").setValue("一時名");
    await wrapper.get("#workspace-create-name").setValue("");
    await submitForm(wrapper);
    expect(wrapper.find('[data-testid="error-alert"]').exists()).toBe(true);

    await wrapper.setProps({ open: false });
    await nextTick();
    await wrapper.setProps({ open: true });
    await flushPromises();

    expect((wrapper.get("#workspace-create-name").element as HTMLInputElement).value).toBe("");
    expect(wrapper.find('[data-testid="error-alert"]').exists()).toBe(false);
  });
});

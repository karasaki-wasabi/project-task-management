// Mount tests for WorkspaceSettingsModal (task 6.5):
// name input, fixed 6-color palette, save → updateWorkspace → refresh,
// cancel. Requirements 6.1, 6.2, 6.3.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import WorkspaceSettingsModal from "./WorkspaceSettingsModal.vue";
import {
  WORKSPACE_COLORS,
  type Workspace,
} from "../../composables/useApiClient";

const updateWorkspace = vi.fn();
const refresh = vi.fn();
const currentId = ref<string | null>("ws-1");
const workspaces = ref<Workspace[]>([]);

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      updateWorkspace,
    }),
  };
});

vi.mock("../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaces,
    currentId,
    refresh,
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
    id: "ws-1",
    name: "営業チーム",
    color: WORKSPACE_COLORS[0],
    createdByUserId: "user-1",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

function mountModal(
  props: { open?: boolean; workspace?: Workspace | null } = {},
) {
  return mount(WorkspaceSettingsModal, {
    props: {
      open: props.open ?? true,
      workspace: props.workspace === undefined ? makeWorkspace() : props.workspace,
    },
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
  await wrapper.get("#workspace-settings-form").trigger("submit");
  await flushPromises();
  await nextTick();
}

describe("WorkspaceSettingsModal (task 6.5)", () => {
  beforeEach(() => {
    updateWorkspace.mockReset();
    refresh.mockReset();
    currentId.value = "ws-1";
    workspaces.value = [makeWorkspace()];
    updateWorkspace.mockResolvedValue(
      makeWorkspace({ name: "更新後", color: WORKSPACE_COLORS[1] }),
    );
    refresh.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("名前入力・固定6色パレット・保存/キャンセルを表示する（Req 6.1, 6.3）", async () => {
    const wrapper = mountModal();
    await flushPromises();

    expect(wrapper.get('[data-testid="modal-title"]').text()).toContain("ワークスペース設定");
    expect(wrapper.find("#workspace-settings-name").exists()).toBe(true);
    expect((wrapper.get("#workspace-settings-name").element as HTMLInputElement).value).toBe(
      "営業チーム",
    );

    const swatches = wrapper.findAll('[data-testid="workspace-color-swatch"]');
    expect(swatches).toHaveLength(WORKSPACE_COLORS.length);
    expect(swatches.map((s) => s.attributes("data-color"))).toEqual([...WORKSPACE_COLORS]);

    const selected = wrapper.get('[data-testid="workspace-color-swatch"][aria-pressed="true"]');
    expect(selected.attributes("data-color")).toBe(WORKSPACE_COLORS[0]);

    expect(buttonByText(wrapper, "保存").exists()).toBe(true);
    expect(buttonByText(wrapper, "キャンセル").exists()).toBe(true);
  });

  it("未入力のまま保存するとエラーを表示し API を呼ばない（Req 6.2）", async () => {
    const wrapper = mountModal();
    await flushPromises();

    await wrapper.get("#workspace-settings-name").setValue("");
    await submitForm(wrapper);

    expect(wrapper.get('[data-testid="error-alert"]').text()).toMatch(/ワークスペース名/);
    expect(updateWorkspace).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("空白のみの名前でもエラーを表示し API を呼ばない（Req 6.2）", async () => {
    const wrapper = mountModal();
    await flushPromises();

    await wrapper.get("#workspace-settings-name").setValue("   ");
    await submitForm(wrapper);

    expect(wrapper.get('[data-testid="error-alert"]').text()).toMatch(/ワークスペース名/);
    expect(updateWorkspace).not.toHaveBeenCalled();
  });

  it("保存成功後に updateWorkspace して refresh する（Req 6.1, 6.3）", async () => {
    const updated = makeWorkspace({ name: "開発チーム", color: WORKSPACE_COLORS[1] });
    const callOrder: string[] = [];
    updateWorkspace.mockImplementation(async () => {
      callOrder.push("update");
      return updated;
    });
    refresh.mockImplementation(async () => {
      callOrder.push("refresh");
      workspaces.value = [updated];
    });

    const wrapper = mountModal();
    await flushPromises();

    await wrapper.get("#workspace-settings-name").setValue("開発チーム");
    const nextColor = wrapper
      .findAll('[data-testid="workspace-color-swatch"]')
      .find((s) => s.attributes("data-color") === WORKSPACE_COLORS[1]);
    if (!nextColor) throw new Error("color swatch not found");
    await nextColor.trigger("click");
    await nextTick();

    await submitForm(wrapper);

    expect(updateWorkspace).toHaveBeenCalledWith("ws-1", {
      name: "開発チーム",
      color: WORKSPACE_COLORS[1],
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["update", "refresh"]);
    expect(wrapper.emitted("saved")?.[0]?.[0]).toEqual(updated);
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("キャンセルで close を emit する", async () => {
    const wrapper = mountModal();
    await flushPromises();

    await buttonByText(wrapper, "キャンセル").trigger("click");

    expect(wrapper.emitted("close")).toBeTruthy();
    expect(updateWorkspace).not.toHaveBeenCalled();
  });

  it("open が true になったとき workspace の値でフォームを初期化する", async () => {
    const wrapper = mountModal({
      open: true,
      workspace: makeWorkspace({ name: "初期名", color: WORKSPACE_COLORS[3] }),
    });
    await flushPromises();

    expect((wrapper.get("#workspace-settings-name").element as HTMLInputElement).value).toBe(
      "初期名",
    );
    expect(
      wrapper.get('[data-testid="workspace-color-swatch"][aria-pressed="true"]').attributes("data-color"),
    ).toBe(WORKSPACE_COLORS[3]);

    await wrapper.get("#workspace-settings-name").setValue("編集中");
    await wrapper.get("#workspace-settings-name").setValue("");
    await submitForm(wrapper);
    expect(wrapper.find('[data-testid="error-alert"]').exists()).toBe(true);

    await wrapper.setProps({ open: false });
    await nextTick();
    await wrapper.setProps({
      open: true,
      workspace: makeWorkspace({ name: "再オープン", color: WORKSPACE_COLORS[4] }),
    });
    await flushPromises();

    expect((wrapper.get("#workspace-settings-name").element as HTMLInputElement).value).toBe(
      "再オープン",
    );
    expect(
      wrapper.get('[data-testid="workspace-color-swatch"][aria-pressed="true"]').attributes("data-color"),
    ).toBe(WORKSPACE_COLORS[4]);
    expect(wrapper.find('[data-testid="error-alert"]').exists()).toBe(false);
  });

  it("workspace が null のときは保存できない", async () => {
    const wrapper = mountModal({ workspace: null });
    await flushPromises();

    await wrapper.get("#workspace-settings-name").setValue("名前");
    await submitForm(wrapper);

    expect(updateWorkspace).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Task, WorkspaceUserSummary } from "../../../../composables/useApiClient";
import TasksPage from "./index.vue";

const listTasks = vi.fn();
const createTask = vi.fn();
const updateTaskStatus = vi.fn();
const splitTask = vi.fn();
const listUsers = vi.fn();
const listWorkspaceMembers = vi.fn();
const listDevelopmentStages = vi.fn();
const currentId = ref<string | null>("ws-1");
const route = { query: {} as Record<string, string | undefined> };

vi.mock("../../../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({ currentId }),
}));

vi.mock("../../../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listTasks,
      createTask,
      updateTaskStatus,
      splitTask,
      listUsers,
      listWorkspaceMembers,
      listDevelopmentStages,
    }),
  };
});

const AssigneeFilterStub = defineComponent({
  name: "AssigneeFilter",
  props: { modelValue: { type: String, required: true } },
  emits: ["update:modelValue"],
  template: `<div data-testid="assignee-filter" />`,
});

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<div data-testid="error-alert">{{ message }}</div>`,
});

const TaskNodeStub = defineComponent({
  name: "TaskNode",
  props: {
    task: { type: Object, required: true },
    children: { type: Array, default: () => [] },
    allTasks: { type: Array, default: () => [] },
    stages: { type: Array, default: () => [] },
  },
  emits: ["status-change", "split"],
  template: `<li data-testid="task-node" :data-stages-count="stages.length">{{ task.title }}</li>`,
});

const NuxtLinkStub = defineComponent({
  name: "NuxtLink",
  props: { to: { type: [String, Object], required: true } },
  template: `<a :href="typeof to === 'string' ? to : '#'" data-testid="nuxt-link"><slot /></a>`,
});

function makeMember(overrides: Partial<WorkspaceUserSummary> = {}): WorkspaceUserSummary {
  return {
    userId: "member-1",
    name: "ワークスペース太郎",
    email: "member@example.com",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "サンプル",
    status: "not_started",
    priority: "medium",
    isRequiredForCase: false,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function mountPage() {
  return mount(TasksPage, {
    global: {
      stubs: {
        AssigneeFilter: AssigneeFilterStub,
        ErrorAlert: ErrorAlertStub,
        TaskNode: TaskNodeStub,
        NuxtLink: NuxtLinkStub,
      },
    },
  });
}

function assigneeOptions(wrapper: ReturnType<typeof mountPage>) {
  const selects = wrapper.findAll("select");
  const assigneeSelect = selects.find((s) =>
    s.findAll("option").some((o) => o.text().includes("担当者未設定")),
  );
  if (!assigneeSelect) throw new Error("assignee select not found");
  return assigneeSelect.findAll("option").filter((o) => o.attributes("value") !== "");
}

describe("担当者候補 (task 8.1, Req 4.1)", () => {
  beforeEach(() => {
    listTasks.mockReset();
    createTask.mockReset();
    updateTaskStatus.mockReset();
    splitTask.mockReset();
    listUsers.mockReset();
    listWorkspaceMembers.mockReset();
    listDevelopmentStages.mockReset();
    currentId.value = "ws-1";
    route.query = {};
    vi.stubGlobal("useRoute", () => route);
    listTasks.mockResolvedValue([makeTask()]);
    createTask.mockResolvedValue(makeTask({ id: "t2" }));
    listDevelopmentStages.mockResolvedValue([
      { id: "s1", name: "作業中", order: 1, kind: "normal" },
      { id: "s-done", name: "完了", order: 2, kind: "completed" },
    ]);
    listWorkspaceMembers.mockResolvedValue([
      makeMember({ userId: "member-1", name: "ワークスペース太郎" }),
      makeMember({ userId: "member-2", name: "ワークスペース花子" }),
    ]);
    listUsers.mockResolvedValue([
      { id: "outsider-1", name: "外部ユーザー", createdAt: "", updatedAt: "" },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("担当者候補を読み込み、listWorkspaceMembers(currentId)を使用し、listUsersを使用しない", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listWorkspaceMembers).toHaveBeenCalledWith("ws-1");
    expect(listUsers).not.toHaveBeenCalled();
    const options = assigneeOptions(wrapper);
    expect(options.map((o) => o.text())).toEqual(["ワークスペース太郎", "ワークスペース花子"]);
    expect(options.map((o) => o.attributes("value"))).toEqual(["member-1", "member-2"]);
    expect(wrapper.text()).not.toContain("外部ユーザー");
  });

  it("選択したワークスペースメンバーのuserIdをassigneeUserIdとして送信", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('input[placeholder="タスク名"]').setValue("新規タスク");
    const selects = wrapper.findAll("select");
    const assigneeSelect = selects.find((s) =>
      s.findAll("option").some((o) => o.text().includes("担当者未設定")),
    );
    await assigneeSelect!.setValue("member-2");
    await wrapper.get("form").trigger("submit.prevent");
    await flushPromises();

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新規タスク",
        assigneeUserId: "member-2",
      }),
    );
  });

  it("current workspaceが未設定の場合、メンバーを読み込まない", async () => {
    currentId.value = null;
    const wrapper = mountPage();
    await flushPromises();

    expect(listWorkspaceMembers).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
    expect(listDevelopmentStages).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(false);
  });

  it("開発ステージを読み込み、TaskNodeに渡す (task-status-model 5.2)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listDevelopmentStages).toHaveBeenCalled();
    const node = wrapper.get('[data-testid="task-node"]');
    expect(node.attributes("data-stages-count")).toBe("2");
  });
});

describe("ストーリーポイント作成フォーム (velocity-dashboard 5.1, Req 1.1-1.4)", () => {
  beforeEach(() => {
    listTasks.mockReset();
    createTask.mockReset();
    updateTaskStatus.mockReset();
    splitTask.mockReset();
    listUsers.mockReset();
    listWorkspaceMembers.mockReset();
    listDevelopmentStages.mockReset();
    currentId.value = "ws-1";
    route.query = {};
    vi.stubGlobal("useRoute", () => route);
    listTasks.mockResolvedValue([makeTask()]);
    createTask.mockResolvedValue(makeTask({ id: "t2", storyPoints: 5 }));
    listDevelopmentStages.mockResolvedValue([]);
    listWorkspaceMembers.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createForm(wrapper: ReturnType<typeof mountPage>) {
    return wrapper.get("form");
  }

  function storyPointsInput(wrapper: ReturnType<typeof mountPage>) {
    const form = createForm(wrapper);
    const byTestId = form.find('[data-testid="story-points-input"]');
    if (byTestId.exists()) return byTestId;
    const labeled = form.findAll("label").find((l) => /ポイント/.test(l.text()));
    if (labeled) {
      const input = labeled.find('input[type="number"]');
      if (input.exists()) return input;
    }
    return form.find('input[type="number"][min="1"]');
  }

  it("作成フォームにオプションのストーリーポイントフィールドを表示 (ラベル: ポイント)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const form = createForm(wrapper);
    expect(form.text()).toMatch(/ポイント/);
    const input = storyPointsInput(wrapper);
    expect(input.exists()).toBe(true);
    expect(input.attributes("type")).toBe("number");
    expect(input.attributes("min")).toBe("1");
    expect(input.attributes("required")).toBeUndefined();
  });

  it("ストーリーポイントをcreateTaskに渡す (値 >= 1)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('input[placeholder="タスク名"]').setValue("ポイント付きタスク");
    await storyPointsInput(wrapper).setValue("5");
    await createForm(wrapper).trigger("submit.prevent");
    await flushPromises();

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "ポイント付きタスク",
        storyPoints: 5,
      }),
    );
  });

  it("ストーリーポイントをcreateTaskに渡さない (フィールドが空)", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('input[placeholder="タスク名"]').setValue("ポイントなしタスク");
    await createForm(wrapper).trigger("submit.prevent");
    await flushPromises();

    expect(createTask).toHaveBeenCalledTimes(1);
    const payload = createTask.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ title: "ポイントなしタスク" });
    expect(payload).not.toHaveProperty("storyPoints");
  });

  it("分割ダイアログにストーリーポイントフィールドを追加しない", async () => {
    listTasks.mockResolvedValue([makeTask({ id: "t1", title: "親タスク" })]);
    const wrapper = mountPage();
    await flushPromises();

    const taskNode = wrapper.findComponent({ name: "TaskNode" });
    await taskNode.vm.$emit("split", makeTask({ id: "t1", title: "親タスク" }));
    await flushPromises();

    const splitHeading = wrapper.findAll("h2").find((h) => h.text().includes("を分割"));
    expect(splitHeading).toBeTruthy();
    const splitSection = splitHeading!.element.parentElement!;
    expect(splitSection.textContent ?? "").not.toMatch(/ポイント/);
    expect(splitSection.querySelector('input[type="number"]')).toBeNull();
    expect(splitSection.querySelector('[data-testid="story-points-input"]')).toBeNull();
  });
});

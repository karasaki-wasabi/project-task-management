// Mount tests for TasksPage assignee candidates (workspace-resource-scope task 8.1).
// Requirement 4.1: create-form assignee options come from current workspace members.
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
const currentId = ref<string | null>("ws-1");
const route = { query: {} as Record<string, string | undefined> };

vi.mock("../../../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({ currentId }),
}));

vi.mock("../../../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listTasks,
      createTask,
      updateTaskStatus,
      splitTask,
      listUsers,
      listWorkspaceMembers,
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
  },
  emits: ["status-change", "split"],
  template: `<li data-testid="task-node">{{ task.title }}</li>`,
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

describe("TasksPage assignee candidates (task 8.1, Req 4.1)", () => {
  beforeEach(() => {
    listTasks.mockReset();
    createTask.mockReset();
    updateTaskStatus.mockReset();
    splitTask.mockReset();
    listUsers.mockReset();
    listWorkspaceMembers.mockReset();
    currentId.value = "ws-1";
    route.query = {};
    vi.stubGlobal("useRoute", () => route);
    listTasks.mockResolvedValue([makeTask()]);
    createTask.mockResolvedValue(makeTask({ id: "t2" }));
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

  it("loads assignee candidates via listWorkspaceMembers(currentId), not listUsers", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listWorkspaceMembers).toHaveBeenCalledWith("ws-1");
    expect(listUsers).not.toHaveBeenCalled();
    const options = assigneeOptions(wrapper);
    expect(options.map((o) => o.text())).toEqual(["ワークスペース太郎", "ワークスペース花子"]);
    expect(options.map((o) => o.attributes("value"))).toEqual(["member-1", "member-2"]);
    expect(wrapper.text()).not.toContain("外部ユーザー");
  });

  it("submits the selected workspace member userId as assigneeUserId", async () => {
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

  it("does not fetch members when current workspace is unset", async () => {
    currentId.value = null;
    const wrapper = mountPage();
    await flushPromises();

    expect(listWorkspaceMembers).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(false);
  });
});

// Mount tests for KanbanPage assignee candidates (workspace-resource-scope task 8.1).
// Requirement 4.1: reassignment candidates come from current workspace members.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type {
  Case,
  DevelopmentStage,
  Task,
  WorkspaceUserSummary,
} from "../../composables/useApiClient";
import KanbanPage from "./index.vue";

const listTasks = vi.fn();
const listUsers = vi.fn();
const listWorkspaceMembers = vi.fn();
const listDevelopmentStages = vi.fn();
const listCases = vi.fn();
const updateTaskDevelopmentStage = vi.fn();
const updateTask = vi.fn();
const currentId = ref<string | null>("ws-1");

vi.mock("../../composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({ currentId }),
}));

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      listTasks,
      listUsers,
      listWorkspaceMembers,
      listDevelopmentStages,
      listCases,
      updateTaskDevelopmentStage,
      updateTask,
    }),
  };
});

vi.mock("../../composables/useDialogFocusTrap", () => ({
  useDialogFocusTrap: () => undefined,
}));

vi.mock("vue-draggable-plus", () => ({
  VueDraggable: defineComponent({
    name: "VueDraggable",
    props: { modelValue: { type: Array, default: () => [] } },
    emits: ["update:modelValue", "change", "end"],
    template: `<div data-testid="vue-draggable"><slot /></div>`,
  }),
}));

const TeamWorkloadSummaryStub = defineComponent({
  name: "TeamWorkloadSummary",
  props: {
    modelValue: { type: String, required: true },
    counts: { type: Array, default: () => [] },
  },
  emits: ["update:modelValue"],
  template: `<div data-testid="team-workload-summary" />`,
});

const AssigneeFocusTrayStub = defineComponent({
  name: "AssigneeFocusTray",
  props: {
    tasks: { type: Array, default: () => [] },
    users: { type: Array, default: () => [] },
  },
  emits: ["assign", "end", "card-activate"],
  template: `<div data-testid="assignee-focus-tray" />`,
});

const UnassignedBacklogPanelStub = defineComponent({
  name: "UnassignedBacklogPanel",
  props: {
    tasks: { type: Array, default: () => [] },
    users: { type: Array, default: () => [] },
  },
  emits: ["end", "card-activate"],
  template: `<div data-testid="unassigned-backlog" />`,
});

const TaskDetailModalStub = defineComponent({
  name: "TaskDetailModal",
  props: {
    taskId: { type: String, default: null },
    users: { type: Array, default: () => [] },
    stages: { type: Array, default: () => [] },
    cases: { type: Array, default: () => [] },
  },
  emits: ["close", "saved", "deleted"],
  template: `
    <div data-testid="task-detail-modal">
      <option
        v-for="user in users"
        :key="user.id"
        :value="user.id"
        data-testid="detail-assignee-option"
      >{{ user.name }}</option>
    </div>
  `,
});

const TaskCardStub = defineComponent({
  name: "TaskCard",
  props: {
    task: { type: Object, required: true },
    assigneeName: { type: String, default: undefined },
    progress: { type: Object, default: undefined },
  },
  emits: ["activate"],
  template: `<div data-testid="task-card">{{ task.title }}</div>`,
});

const BadgeStub = defineComponent({
  name: "Badge",
  props: {
    tone: { type: String, required: true },
    label: { type: String, required: true },
  },
  template: `<span data-testid="badge">{{ label }}</span>`,
});

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<div data-testid="error-alert">{{ message }}</div>`,
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

function makeStage(overrides: Partial<DevelopmentStage> = {}): DevelopmentStage {
  return {
    id: "s1",
    name: "実装",
    order: 1,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "未割当タスク",
    status: "not_started",
    priority: "medium",
    isRequiredForCase: false,
    assigneeUserId: null,
    developmentStageId: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: "c1",
    name: "案件A",
    startDate: null,
    endDate: null,
    isCompleted: false,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function mountPage() {
  vi.stubGlobal("definePageMeta", () => undefined);
  return mount(KanbanPage, {
    global: {
      stubs: {
        TeamWorkloadSummary: TeamWorkloadSummaryStub,
        AssigneeFocusTray: AssigneeFocusTrayStub,
        UnassignedBacklogPanel: UnassignedBacklogPanelStub,
        TaskDetailModal: TaskDetailModalStub,
        TaskCard: TaskCardStub,
        Badge: BadgeStub,
        ErrorAlert: ErrorAlertStub,
        NuxtLink: NuxtLinkStub,
      },
    },
  });
}

describe("KanbanPage assignee candidates (task 8.1, Req 4.1)", () => {
  beforeEach(() => {
    listTasks.mockReset();
    listUsers.mockReset();
    listWorkspaceMembers.mockReset();
    listDevelopmentStages.mockReset();
    listCases.mockReset();
    updateTaskDevelopmentStage.mockReset();
    updateTask.mockReset();
    currentId.value = "ws-1";
    listTasks.mockResolvedValue([makeTask()]);
    listDevelopmentStages.mockResolvedValue([makeStage()]);
    listCases.mockResolvedValue([makeCase()]);
    listWorkspaceMembers.mockResolvedValue([
      makeMember({ userId: "member-1", name: "ワークスペース太郎" }),
      makeMember({ userId: "member-2", name: "ワークスペース花子" }),
    ]);
    listUsers.mockResolvedValue([
      { id: "outsider-1", name: "外部ユーザー", createdAt: "", updatedAt: "" },
    ]);
    updateTaskDevelopmentStage.mockResolvedValue(makeTask({ developmentStageId: "s1", assigneeUserId: "member-2" }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads reassignment candidates via listWorkspaceMembers(currentId), not listUsers", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listWorkspaceMembers).toHaveBeenCalledWith("ws-1");
    expect(listUsers).not.toHaveBeenCalled();

    const detailOptions = wrapper.findAll('[data-testid="detail-assignee-option"]');
    expect(detailOptions.map((o) => o.text())).toEqual(["ワークスペース太郎", "ワークスペース花子"]);
    expect(detailOptions.map((o) => o.attributes("value"))).toEqual(["member-1", "member-2"]);
    expect(wrapper.text()).not.toContain("外部ユーザー");
  });

  it("assignee-picker options use workspace member userIds for pending reassignment", async () => {
    const wrapper = mountPage();
    await flushPromises();

    // Drop an unassigned task onto a stage column → opens assignee-picker.
    const vm = wrapper.vm as unknown as {
      onDropOnStage: (stageId: string, taskId: string) => Promise<void>;
    };
    await vm.onDropOnStage("s1", "t1");
    await flushPromises();

    expect(wrapper.find(".assignee-picker").exists()).toBe(true);
    const options = wrapper
      .find(".assignee-picker select")
      .findAll("option")
      .filter((o) => o.attributes("value") !== "");
    expect(options.map((o) => o.text())).toEqual(["ワークスペース太郎", "ワークスペース花子"]);
    expect(options.map((o) => o.attributes("value"))).toEqual(["member-1", "member-2"]);

    await wrapper.find(".assignee-picker select").setValue("member-2");
    await wrapper.findAll(".assignee-picker button").find((b) => b.text() === "確定")!.trigger("click");
    await flushPromises();

    expect(updateTaskDevelopmentStage).toHaveBeenCalledWith("t1", "s1", "member-2");
  });

  it("does not fetch members when current workspace is unset", async () => {
    currentId.value = null;
    const wrapper = mountPage();
    await flushPromises();

    expect(listWorkspaceMembers).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="workspace-empty-state"]').exists()).toBe(true);
  });
});

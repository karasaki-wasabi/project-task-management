import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Task } from "../../../../composables/useApiClient";
import TaskDetailPage from "./[taskId].vue";

const getTask = vi.fn();
const listTasks = vi.fn();
const listDevelopmentStages = vi.fn();
const listCases = vi.fn();
const listWorkspaceMembers = vi.fn();
const updateTask = vi.fn();
const updateTaskStatus = vi.fn();
const updateTaskDevelopmentStage = vi.fn();
const createTask = vi.fn();
const deleteTask = vi.fn();
const navigateTo = vi.fn();
const createError = vi.fn((input: object) => input);
const showError = vi.fn();
const currentUser = ref({
  id: "user-1",
  name: "山田",
  email: "yamada@example.test",
  createdAt: "",
  updatedAt: "",
});

vi.mock("../../../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      getTask,
      listTasks,
      listDevelopmentStages,
      listCases,
      listWorkspaceMembers,
      updateTask,
      updateTaskStatus,
      updateTaskDevelopmentStage,
      createTask,
      deleteTask,
    }),
  };
});

vi.mock("../../../../composables/useAuth", () => ({
  useAuth: () => ({ user: currentUser }),
}));

const TaskFieldCardStub = defineComponent({
  name: "TaskFieldCard",
  props: {
    task: { type: Object, required: true },
    editable: { type: Boolean, required: true },
    onUpdate: { type: Function, required: true },
  },
  template: `
    <section data-testid="field-card" :data-editable="String(editable)">
      {{ task.title }}
      <button type="button" data-testid="update-title" @click="onUpdate('title', '更新後')">タイトル更新</button>
    </section>
  `,
});

const TaskTimelineStub = defineComponent({
  name: "TaskTimeline",
  props: {
    taskId: { type: String, required: true },
    currentUserId: { type: String, required: true },
    readOnly: { type: Boolean, default: false },
  },
  template: `<section data-testid="timeline" :data-user-id="currentUserId" :data-read-only="String(readOnly)">タイムライン</section>`,
});

const CommentComposerStub = defineComponent({
  name: "CommentComposer",
  props: {
    taskId: { type: String, required: true },
    mode: { type: String, required: true },
  },
  emits: ["success"],
  template: `<form data-testid="comment-composer">コメント</form>`,
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "詳細ページを作る",
    status: "in_progress",
    priority: "high",
    detail: "背景",
    caseId: "case-1",
    isRequiredForCase: true,
    parentTaskId: "parent-1",
    assigneeUserId: "user-1",
    developmentStageId: "stage-1",
    scheduledEndDate: "2026-08-31",
    completedAt: "2026-08-10T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function mountPage() {
  return mount(TaskDetailPage, {
    global: {
      stubs: {
        NuxtLink: defineComponent({
          props: { to: { type: [String, Object], required: true } },
          template: `<a :href="typeof to === 'string' ? to : '#'"><slot /></a>`,
        }),
        TaskFieldCard: TaskFieldCardStub,
        TaskTimeline: TaskTimelineStub,
        CommentComposer: CommentComposerStub,
        ErrorAlert: defineComponent({
          props: { message: { type: String, required: true } },
          template: `<p role="alert">{{ message }}</p>`,
        }),
      },
    },
  });
}

describe("TaskDetailPage", () => {
  beforeEach(() => {
    vi.stubGlobal("useRoute", () => ({
      params: { workspaceId: "ws-1", taskId: "task-1" },
    }));
    vi.stubGlobal("navigateTo", navigateTo);
    vi.stubGlobal("createError", createError);
    vi.stubGlobal("showError", showError);

    getTask.mockResolvedValue(makeTask());
    listTasks.mockResolvedValue([
      makeTask({ id: "parent-1", title: "親タスク", parentTaskId: null }),
      makeTask({ id: "child-1", title: "子タスク", parentTaskId: "task-1" }),
    ]);
    listDevelopmentStages.mockResolvedValue([
      { id: "stage-1", name: "実装中", order: 1, kind: "normal" },
    ]);
    listCases.mockResolvedValue([
      {
        id: "case-1",
        name: "案件A",
        endDate: null,
        isCompleted: false,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    listWorkspaceMembers.mockResolvedValue([
      { userId: "user-1", name: "山田", email: "yamada@example.test" },
    ]);
    updateTask.mockImplementation(async (_id, input) => makeTask(input));
    updateTaskStatus.mockResolvedValue(makeTask());
    updateTaskDevelopmentStage.mockResolvedValue(makeTask());
    createTask.mockResolvedValue(makeTask({ id: "task-copy" }));
    deleteTask.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("フィールド、コメント投稿、現在ユーザー付きタイムラインを1カラムに構成する", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-testid="field-card"]').attributes("data-editable")).toBe("true");
    expect(wrapper.get('[data-testid="comment-composer"]').text()).toBe("コメント");
    expect(wrapper.get('[data-testid="timeline"]').attributes("data-user-id")).toBe("user-1");
    expect(wrapper.get('[data-testid="field-card"]').element.compareDocumentPosition(
      wrapper.get('[data-testid="timeline"]').element,
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("フィールド更新を対応APIへ渡して表示を更新する", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="update-title"]').trigger("click");
    await flushPromises();

    expect(updateTask).toHaveBeenCalledWith("task-1", { title: "更新後" });
    expect(wrapper.text()).toContain("更新後");
  });

  it("複製では指定フィールドだけを作成APIへ渡して新規詳細へ遷移する", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('button[aria-label="タスクを複製"]').trigger("click");
    await flushPromises();

    expect(createTask).toHaveBeenCalledWith({
      title: "詳細ページを作る",
      priority: "high",
      detail: "背景",
      assigneeUserId: "user-1",
      caseId: "case-1",
      isRequiredForCase: true,
      parentTaskId: "parent-1",
      scheduledEndDate: "2026-08-31",
    });
    const payload = createTask.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("developmentStageId");
    expect(payload).not.toHaveProperty("completedAt");
    expect(navigateTo).toHaveBeenCalledWith("/workspaces/ws-1/tasks/task-copy");
  });

  it("削除確認後に論理削除APIを呼びタスク一覧へ遷移する", async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get('button[aria-label="タスクを削除"]').trigger("click");
    expect(deleteTask).not.toHaveBeenCalled();
    await wrapper.get('button[aria-label="タスク削除を確定"]').trigger("click");
    await flushPromises();

    expect(deleteTask).toHaveBeenCalledWith("task-1");
    expect(navigateTo).toHaveBeenCalledWith("/workspaces/ws-1/tasks");
  });

  it("削除済みタスクは参照専用で編集、複製、削除、コメント投稿を隠す", async () => {
    getTask.mockResolvedValue(makeTask({ deletedAt: "2026-08-12T00:00:00.000Z" }));
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-testid="field-card"]').attributes("data-editable")).toBe("false");
    expect(wrapper.find('[data-testid="comment-composer"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="タスクを複製"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="タスクを削除"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="timeline"]').text()).toBe("タイムライン");
    expect(wrapper.get('[data-testid="timeline"]').attributes("data-read-only")).toBe("true");
    expect(wrapper.text()).toContain("削除済み");
  });

  it("タスクが存在しない場合は404エラーを表示する", async () => {
    const missing = Object.assign(new Error("Task not found"), { statusCode: 404 });
    getTask.mockRejectedValue(missing);
    mountPage();
    await flushPromises();

    expect(createError).toHaveBeenCalledWith({
      statusCode: 404,
      statusMessage: "タスクが見つかりません",
    });
    expect(showError).toHaveBeenCalled();
  });
});

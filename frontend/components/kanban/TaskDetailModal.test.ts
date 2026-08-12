// Mount tests for TaskDetailModal stage/status display
// (task-status-model 5.3, Requirements 4.5, 8.2; design.md TaskDetailModal.vue).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { Case, DevelopmentStage, Task, User } from "../../composables/useApiClient";
import StageBadge from "../shared/StageBadge.vue";
import TaskDetailModal from "./TaskDetailModal.vue";

const getTask = vi.fn();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      getTask,
    }),
  };
});

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
    </div>
  `,
});

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<div data-testid="error-alert">{{ message }}</div>`,
});

const StatusBadgeStub = defineComponent({
  name: "StatusBadge",
  props: { status: { type: String, required: true } },
  template: `<span data-testid="status-badge">{{ status }}</span>`,
});

const PriorityBadgeStub = defineComponent({
  name: "PriorityBadge",
  props: { priority: { type: String, required: true } },
  template: `<span data-testid="priority-badge">{{ priority }}</span>`,
});

const BadgeStub = defineComponent({
  name: "Badge",
  props: {
    tone: { type: String, required: true },
    label: { type: String, required: true },
  },
  template: `<span data-testid="badge">{{ label }}</span>`,
});

const NuxtLinkStub = defineComponent({
  name: "NuxtLink",
  props: {
    to: { type: String, required: true },
  },
  template: `<a :href="to"><slot /></a>`,
});

const stages: DevelopmentStage[] = [
  { id: "s-normal", name: "作業中", order: 1, kind: "normal" },
  { id: "s-done", name: "完了", order: 2, kind: "completed" },
  { id: "s-cancel", name: "中止", order: 3, kind: "cancelled" },
];

const users: User[] = [
  {
    id: "u1",
    name: "山田",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const cases: Case[] = [
  {
    id: "c1",
    name: "案件A",
    endDate: "2026-08-10",
    isCompleted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "詳細タスク",
    status: "in_progress",
    priority: "medium",
    isRequiredForCase: false,
    developmentStageId: "s-normal",
    assigneeUserId: "u1",
    caseId: "c1",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

async function mountDetail(task: Task) {
  getTask.mockResolvedValue(task);
  const wrapper = mount(TaskDetailModal, {
    props: {
      taskId: task.id,
      users,
      stages,
      cases,
    },
    global: {
      stubs: {
        Modal: ModalStub,
        ErrorAlert: ErrorAlertStub,
        StatusBadge: StatusBadgeStub,
        PriorityBadge: PriorityBadgeStub,
        Badge: BadgeStub,
        NuxtLink: NuxtLinkStub,
      },
      components: {
        StageBadge,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

function stageIndexInBadges(wrapper: Awaited<ReturnType<typeof mountDetail>>): number {
  const row = wrapper.get('[data-testid="task-detail-badges"]');
  const stageEl = row.findComponent(StageBadge).element;
  return Array.from(row.element.children).indexOf(stageEl as Element);
}

describe("TaskDetailModal (task-status-model 5.3)", () => {
  beforeEach(() => {
    getTask.mockReset();
    vi.stubGlobal("useRoute", () => ({ params: { workspaceId: "w1" } }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders StageBadge with modal prefix instead of a plain Badge for the stage", async () => {
    const wrapper = await mountDetail(makeTask({ developmentStageId: "s-normal" }));

    expect(wrapper.findComponent(StageBadge).exists()).toBe(true);
    expect(wrapper.text()).toContain("開発段階: 作業中");
    const stageLikeBadges = wrapper
      .findAll('[data-testid="badge"]')
      .filter((b) => b.text().includes("開発段階:"));
    expect(stageLikeBadges).toHaveLength(0);
  });

  it("shows unset StageBadge when developmentStageId is null", async () => {
    const wrapper = await mountDetail(makeTask({ developmentStageId: null }));
    expect(wrapper.findComponent(StageBadge).exists()).toBe(true);
    expect(wrapper.text()).toContain("開発段階: 未設定");
  });

  it("hides StatusBadge on completed stage", async () => {
    const wrapper = await mountDetail(
      makeTask({ id: "t-done", developmentStageId: "s-done", status: "not_started" }),
    );

    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("開発段階: 完了");
  });

  it("hides StatusBadge on cancelled stage", async () => {
    const wrapper = await mountDetail(
      makeTask({ id: "t-cancel", developmentStageId: "s-cancel", status: "not_started" }),
    );

    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("開発段階: 中止");
  });

  it("shows StatusBadge on open stages", async () => {
    const wrapper = await mountDetail(makeTask());
    expect(wrapper.find('[data-testid="status-badge"]').exists()).toBe(true);
  });

  it("keeps StageBadge at the same position when status badge is omitted on terminal stages", async () => {
    const open = await mountDetail(makeTask({ id: "open", developmentStageId: "s-normal" }));
    const closed = await mountDetail(
      makeTask({ id: "closed", developmentStageId: "s-done", status: "not_started" }),
    );

    expect(open.find('[data-testid="status-badge"]').exists()).toBe(true);
    expect(closed.find('[data-testid="status-badge"]').exists()).toBe(false);
    expect(stageIndexInBadges(open)).toBe(stageIndexInBadges(closed));
  });

  it("links to the task detail page while keeping light edits and omitting comments and timeline", async () => {
    const wrapper = await mountDetail(makeTask());

    const detailLink = wrapper.get('a[href="/workspaces/w1/tasks/t1"]');
    expect(detailLink.text()).toBe("詳細ページを開く ↗");
    expect(wrapper.text()).not.toContain("コメント");
    expect(wrapper.text()).not.toContain("タイムライン");

    await wrapper.get("button").trigger("click");
    expect(wrapper.find("#task-detail-title").exists()).toBe(true);
    expect(wrapper.find("#task-detail-priority").exists()).toBe(true);
    expect(wrapper.find("#task-detail-stage").exists()).toBe(true);
    expect(wrapper.find("#task-detail-assignee").exists()).toBe(true);
    expect(wrapper.find("#task-detail-case").exists()).toBe(true);
    expect(wrapper.find("#task-detail-detail").exists()).toBe(true);
  });
});

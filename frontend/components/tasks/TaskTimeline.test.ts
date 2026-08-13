import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import TaskTimeline from "./TaskTimeline.vue";
import type {
  Comment,
  TaskTimelineChange,
  TaskTimelineComment,
  TaskTimelineFilter,
  TaskTimelineOptions,
  TaskTimelinePage,
} from "../../composables/useApiClient";

const getTaskTimeline =
  vi.fn<(taskId: string, options: TaskTimelineOptions) => Promise<TaskTimelinePage>>();
const createComment = vi.fn<(taskId: string, body: string) => Promise<Comment>>();
const updateComment =
  vi.fn<(taskId: string, commentId: string, body: string) => Promise<Comment>>();
const deleteComment = vi.fn<(taskId: string, commentId: string) => Promise<void>>();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({
      getTaskTimeline,
      createComment,
      updateComment,
      deleteComment,
    }),
  };
});

function makeComment(overrides: Partial<TaskTimelineComment> = {}): TaskTimelineComment {
  return {
    id: "comment-own",
    taskId: "task-1",
    authorUserId: "user-current",
    body: "自分のコメント",
    editedAt: null,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    deletedAt: null,
    type: "comment",
    occurredAt: "2026-08-12T00:00:00.000Z",
    ...overrides,
  };
}

function makeChange(overrides: Partial<TaskTimelineChange> = {}): TaskTimelineChange {
  return {
    id: "change-1",
    taskId: "task-1",
    actorUserId: "user-actor",
    actorSourceLabel: null,
    operationType: "field_changed",
    fieldName: "title",
    beforeValue: "変更前",
    afterValue: "変更後",
    occurredAt: "2026-08-12T01:00:00.000Z",
    type: "change",
    ...overrides,
  };
}

function page(items: TaskTimelinePage["items"], nextCursor: string | null = null) {
  return { items, nextCursor };
}

function mountTimeline(readOnly = false) {
  return mount(TaskTimeline, {
    props: {
      taskId: "task-1",
      currentUserId: "user-current",
      readOnly,
    },
  });
}

describe("TaskTimeline", () => {
  beforeEach(() => {
    getTaskTimeline.mockReset();
    createComment.mockReset();
    updateComment.mockReset();
    deleteComment.mockReset();
    getTaskTimeline.mockResolvedValue(page([]));
  });

  it("初期表示とタブ切替ごとにサーバーから該当フィルターを再取得する", async () => {
    getTaskTimeline
      .mockResolvedValueOnce(page([makeComment()]))
      .mockResolvedValueOnce(page([makeComment({ id: "comment-filtered", body: "コメントだけ" })]))
      .mockResolvedValueOnce(page([makeChange({ id: "change-filtered" })]));
    const wrapper = mountTimeline();
    await flushPromises();

    expect(getTaskTimeline).toHaveBeenNthCalledWith(1, "task-1", { filter: "all" });
    expect(wrapper.text()).toContain("自分のコメント");

    await wrapper.get('button[role="tab"][data-filter="comments"]').trigger("click");
    await flushPromises();

    expect(getTaskTimeline).toHaveBeenNthCalledWith(2, "task-1", { filter: "comments" });
    expect(wrapper.text()).toContain("コメントだけ");
    expect(wrapper.text()).not.toContain("タイトルを");

    await wrapper.get('button[role="tab"][data-filter="changes"]').trigger("click");
    await flushPromises();

    expect(getTaskTimeline).toHaveBeenNthCalledWith(3, "task-1", { filter: "changes" });
    expect(wrapper.text()).toMatch(/タイトルを 変更前 から 変更後 に変更しました/);
    expect(wrapper.text()).not.toContain("コメントだけ");
  });

  it.each([
    ["title", "タイトルを 変更前 から 変更後 に変更しました"],
    ["status", "ステータスを 変更前 から 変更後 に変更しました"],
    ["priority", "優先度を 変更前 から 変更後 に変更しました"],
    ["assignee", "担当者を 変更前 から 変更後 に変更しました"],
    ["case", "案件を 変更前 から 変更後 に変更しました"],
    ["developmentStage", "開発段階を 変更前 から 変更後 に移しました"],
    ["parentTask", "親タスクを 変更前 から 変更後 に変更しました"],
    ["scheduledEndDate", "終了予定日を 変更前 から 変更後 に変更しました"],
  ] as const)("要件 6.4 の %s 変更文言を表示する", async (fieldName, expected) => {
    getTaskTimeline.mockResolvedValue(page([makeChange({ fieldName })]));
    const wrapper = mountTimeline();
    await flushPromises();

    expect(wrapper.text()).toContain(`user-actor が${expected}`);
  });

  it("メンバー・案件・段階・親タスクの表示名を解決して表示する", async () => {
    getTaskTimeline.mockResolvedValue(
      page([
        makeComment({
          id: "comment-named",
          authorUserId: "user-current",
          body: "名前付きコメント",
        }),
        makeChange({
          id: "change-named-assignee",
          actorUserId: "user-actor",
          fieldName: "assignee",
          beforeValue: null,
          afterValue: "user-next",
        }),
        makeChange({
          id: "change-named-case",
          actorUserId: "user-actor",
          fieldName: "case",
          beforeValue: "case-1",
          afterValue: "case-2",
        }),
        makeChange({
          id: "change-named-stage",
          actorUserId: "user-actor",
          fieldName: "developmentStage",
          beforeValue: "stage-1",
          afterValue: "stage-2",
        }),
        makeChange({
          id: "change-named-parent",
          actorUserId: "user-actor",
          fieldName: "parentTask",
          beforeValue: "task-parent-a",
          afterValue: "task-parent-b",
        }),
      ]),
    );
    const wrapper = mount(TaskTimeline, {
      props: {
        taskId: "task-1",
        currentUserId: "user-current",
        users: [
          {
            id: "user-current",
            name: "自分太郎",
            createdAt: "",
            updatedAt: "",
          },
          {
            id: "user-actor",
            name: "操作花子",
            createdAt: "",
            updatedAt: "",
          },
          {
            id: "user-next",
            name: "次郎",
            createdAt: "",
            updatedAt: "",
          },
        ],
        cases: [
          { id: "case-1", name: "案件A", createdAt: "", updatedAt: "" },
          { id: "case-2", name: "案件B", createdAt: "", updatedAt: "" },
        ],
        stages: [
          {
            id: "stage-1",
            name: "設計",
            kind: "normal",
            order: 1,
          },
          {
            id: "stage-2",
            name: "実装",
            kind: "normal",
            order: 2,
          },
        ],
        tasks: [
          {
            id: "task-parent-a",
            title: "親A",
            status: "todo",
            priority: "medium",
            detail: null,
            caseId: null,
            isRequiredForCase: false,
            parentTaskId: null,
            assigneeUserId: null,
            developmentStageId: null,
            scheduledEndDate: null,
            completedAt: null,
            createdAt: "",
            updatedAt: "",
            deletedAt: null,
          },
          {
            id: "task-parent-b",
            title: "親B",
            status: "todo",
            priority: "medium",
            detail: null,
            caseId: null,
            isRequiredForCase: false,
            parentTaskId: null,
            assigneeUserId: null,
            developmentStageId: null,
            scheduledEndDate: null,
            completedAt: null,
            createdAt: "",
            updatedAt: "",
            deletedAt: null,
          },
        ],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("自分太郎");
    expect(wrapper.text()).toContain("操作花子 が担当者を 未設定 から 次郎 に変更しました");
    expect(wrapper.text()).toContain("操作花子 が案件を 案件A から 案件B に変更しました");
    expect(wrapper.text()).toContain("操作花子 が開発段階を 設計 から 実装 に移しました");
    expect(wrapper.text()).toContain("操作花子 が親タスクを 親A から 親B に変更しました");
    expect(wrapper.text()).not.toContain("user-actor が");
    expect(wrapper.text()).not.toContain("user-current");
  });

  it("未設定値、詳細変更、必須タスク設定と解除を要件どおり表示する", async () => {
    getTaskTimeline.mockResolvedValue(
      page([
        makeChange({
          id: "change-unset",
          fieldName: "assignee",
          beforeValue: null,
          afterValue: "user-next",
        }),
        makeChange({
          id: "change-detail",
          fieldName: "detail",
          beforeValue: "秘密の変更前",
          afterValue: "秘密の変更後",
        }),
        makeChange({
          id: "change-required-on",
          fieldName: "isRequiredForCase",
          beforeValue: "false",
          afterValue: "true",
        }),
        makeChange({
          id: "change-required-off",
          fieldName: "isRequiredForCase",
          beforeValue: "true",
          afterValue: "false",
        }),
      ]),
    );
    const wrapper = mountTimeline();
    await flushPromises();

    expect(wrapper.text()).toContain("担当者を 未設定 から user-next に変更しました");
    expect(wrapper.text()).toContain("user-actor が詳細を更新しました");
    expect(wrapper.text()).not.toContain("秘密の変更前");
    expect(wrapper.text()).not.toContain("秘密の変更後");
    expect(wrapper.text()).toContain("user-actor がこのタスクを必須タスクに設定しました");
    expect(wrapper.text()).toContain("user-actor が必須タスクの設定を解除しました");
    expect(wrapper.get('[data-testid="timeline-value-chip"]').text()).toBe("未設定");
  });

  it("日付見出しで塊化し、時刻は HH:mm で出す", async () => {
    getTaskTimeline.mockResolvedValue(
      page([
        makeChange({ id: "newer", occurredAt: "2026-08-12T10:00:00.000Z" }),
        makeChange({
          id: "older-same-day",
          occurredAt: "2026-08-12T08:00:00.000Z",
          fieldName: "detail",
        }),
        makeChange({
          id: "previous-day",
          occurredAt: "2026-08-11T10:00:00.000Z",
          fieldName: "priority",
        }),
      ]),
    );
    const wrapper = mountTimeline();
    await flushPromises();

    const headings = wrapper.findAll('[data-testid="timeline-date-heading"]');
    expect(headings).toHaveLength(2);
    expect(wrapper.text()).not.toContain("新しい順");
    expect(wrapper.findAll("time").every((time) => /^\d{2}:\d{2}$/.test(time.text()))).toBe(true);
    expect(
      wrapper.findAll("time").every((time) => time.classes().includes("shrink-0")),
    ).toBe(true);
  });

  it("ステータス変更は日本語ラベルのチップで表示する", async () => {
    getTaskTimeline.mockResolvedValue(
      page([
        makeChange({
          fieldName: "status",
          beforeValue: "not_started",
          afterValue: "in_progress",
        }),
      ]),
    );
    const wrapper = mountTimeline();
    await flushPromises();

    const chips = wrapper.findAll('[data-testid="timeline-value-chip"]');
    expect(chips.map((chip) => chip.text())).toEqual(["未着手", "作業中"]);
    expect(wrapper.text()).toMatch(/ステータスを 未着手 から 作業中 に変更しました/);
  });

  it("編集済み表示を行い、自分のコメントだけに編集・削除操作を提示する", async () => {
    getTaskTimeline.mockResolvedValue(
      page([
        makeComment({ editedAt: "2026-08-12T00:30:00.000Z" }),
        makeComment({
          id: "comment-other",
          authorUserId: "user-other",
          body: "他人のコメント",
        }),
      ]),
    );
    const wrapper = mountTimeline();
    await flushPromises();

    expect(wrapper.text()).toContain("（編集済み）");
    expect(wrapper.find('button[aria-label="自分のコメントを編集"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="自分のコメントを削除"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="他人のコメントを編集"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="他人のコメントを削除"]').exists()).toBe(false);
  });

  it("参照専用では自分のコメントにも編集・削除操作を提示しない", async () => {
    getTaskTimeline.mockResolvedValue(page([makeComment()]));
    const wrapper = mountTimeline(true);
    await flushPromises();

    expect(wrapper.text()).toContain("自分のコメント");
    expect(wrapper.find('button[aria-label="自分のコメントを編集"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="自分のコメントを削除"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="comment-composer-create"]').exists()).toBe(false);
  });

  it("ヘッダー・投稿欄・一覧を1枚のカードに収める", async () => {
    getTaskTimeline.mockResolvedValue(page([makeComment()]));
    const wrapper = mountTimeline();
    await flushPromises();

    const card = wrapper.get('[data-testid="task-timeline"]');
    expect(card.classes()).toEqual(
      expect.arrayContaining(["rounded-xl", "border", "border-slate-200", "bg-white"]),
    );
    expect(card.find("#task-timeline-heading").exists()).toBe(true);
    expect(card.find('[data-testid="comment-composer-create"]').exists()).toBe(true);
    expect(card.find("article").exists()).toBe(true);
    expect(card.find("article").classes()).not.toContain("shadow-sm");
    expect(wrapper.findAll('[data-testid="task-timeline"]').length).toBe(1);
  });

  it("自分のコメントを CommentComposer で編集し、成功後に再取得する", async () => {
    const updated = makeComment({
      body: "編集後のコメント",
      editedAt: "2026-08-12T02:00:00.000Z",
    });
    getTaskTimeline
      .mockResolvedValueOnce(page([makeComment()]))
      .mockResolvedValueOnce(page([updated]));
    updateComment.mockResolvedValue(updated);
    const wrapper = mountTimeline();
    await flushPromises();

    await wrapper.get('button[aria-label="自分のコメントを編集"]').trigger("click");
    expect(wrapper.find("article").exists()).toBe(false);
    expect(wrapper.get("time").attributes("datetime")).toBe("2026-08-12T00:00:00.000Z");
    const editor = wrapper.get('[data-testid="comment-composer-edit"]');
    expect(editor.text()).not.toContain("Ctrl + Enter");
    await editor.get("textarea").setValue("編集後のコメント");
    await editor.trigger("submit");
    await flushPromises();

    expect(updateComment).toHaveBeenCalledWith("task-1", "comment-own", "編集後のコメント");
    expect(getTaskTimeline).toHaveBeenLastCalledWith("task-1", { filter: "all" });
    expect(wrapper.text()).toContain("編集後のコメント");
  });

  it("コメント編集をキャンセルすると本文表示に戻る", async () => {
    getTaskTimeline.mockResolvedValue(page([makeComment()]));
    const wrapper = mountTimeline();
    await flushPromises();

    await wrapper.get('button[aria-label="自分のコメントを編集"]').trigger("click");
    await wrapper.get('[data-testid="comment-composer-edit"] button[type="button"]').trigger("click");

    expect(updateComment).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="comment-composer-edit"]').exists()).toBe(false);
    expect(wrapper.get("article").text()).toContain("自分のコメント");
  });

  it("自分のコメントを削除し、成功後に再取得する", async () => {
    getTaskTimeline
      .mockResolvedValueOnce(page([makeComment()]))
      .mockResolvedValueOnce(page([]));
    deleteComment.mockResolvedValue();
    const wrapper = mountTimeline();
    await flushPromises();

    await wrapper.get('button[aria-label="自分のコメントを削除"]').trigger("click");
    expect(wrapper.get("article").text()).toContain("自分のコメント");
    expect(wrapper.find('button[aria-label="自分のコメントを編集"]').exists()).toBe(true);
    expect(wrapper.get("time").attributes("datetime")).toBe("2026-08-12T00:00:00.000Z");
    expect(wrapper.get('[data-testid="delete-comment-confirm"]').text()).toContain(
      "本当に削除しますか?",
    );
    expect(wrapper.text()).not.toContain("削除するとタイムラインから消えます");
    expect(deleteComment).not.toHaveBeenCalled();

    await wrapper.get('button[aria-label="コメント削除を確定"]').trigger("click");
    await flushPromises();

    expect(deleteComment).toHaveBeenCalledWith("task-1", "comment-own");
    expect(getTaskTimeline).toHaveBeenLastCalledWith("task-1", { filter: "all" });
    expect(wrapper.text()).not.toContain("自分のコメント");
  });

  it("コメント削除の確認をキャンセルすると API を呼ばない", async () => {
    getTaskTimeline.mockResolvedValue(page([makeComment()]));
    const wrapper = mountTimeline();
    await flushPromises();

    await wrapper.get('button[aria-label="自分のコメントを削除"]').trigger("click");
    await wrapper.get('button[aria-label="コメント削除をキャンセル"]').trigger("click");
    await flushPromises();

    expect(deleteComment).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="delete-comment-confirm"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("自分のコメント");
  });

  it("次ページを同じフィルターとカーソルで取得して追記する", async () => {
    getTaskTimeline
      .mockResolvedValueOnce(page([makeComment()], "next-page"))
      .mockResolvedValueOnce(
        page([makeChange({ id: "change-next", fieldName: "priority" })]),
      );
    const wrapper = mountTimeline();
    await flushPromises();

    await wrapper.get('button[aria-label="さらに読み込む"]').trigger("click");
    await flushPromises();

    expect(getTaskTimeline).toHaveBeenLastCalledWith("task-1", {
      filter: "all",
      cursor: "next-page",
    });
    expect(wrapper.text()).toContain("自分のコメント");
    expect(wrapper.text()).toContain("優先度を 変更前 から 変更後 に変更しました");
  });

  it("コメントタブが空のときはまだコメントはありませんと表示する", async () => {
    getTaskTimeline.mockResolvedValue(page([]));
    const wrapper = mountTimeline();
    await flushPromises();

    await wrapper.get('button[role="tab"][data-filter="comments"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("まだコメントはありません");
    expect(wrapper.text()).not.toContain("表示する項目がありません");
  });

  it("取得・削除エラーを画面内に表示する", async () => {
    getTaskTimeline.mockRejectedValueOnce(new Error("タイムラインを取得できませんでした"));
    const failedLoad = mountTimeline();
    await flushPromises();
    expect(failedLoad.get('[role="alert"]').text()).toContain(
      "タイムラインを取得できませんでした",
    );

    getTaskTimeline.mockResolvedValueOnce(page([makeComment()]));
    deleteComment.mockRejectedValueOnce(new Error("コメントを削除できませんでした"));
    const failedDelete = mountTimeline();
    await flushPromises();
    await failedDelete.get('button[aria-label="自分のコメントを削除"]').trigger("click");
    await failedDelete.get('button[aria-label="コメント削除を確定"]').trigger("click");
    await flushPromises();

    expect(failedDelete.get('[role="alert"]').text()).toContain(
      "コメントを削除できませんでした",
    );
  });

  it("taskId が変わると選択中フィルターの先頭から再取得する", async () => {
    getTaskTimeline.mockResolvedValue(page([]));
    const wrapper = mountTimeline();
    await flushPromises();
    await wrapper.get('button[role="tab"][data-filter="comments"]').trigger("click");
    await flushPromises();

    await wrapper.setProps({ taskId: "task-2" });
    await flushPromises();

    expect(getTaskTimeline).toHaveBeenLastCalledWith("task-2", {
      filter: "comments" satisfies TaskTimelineFilter,
    });
  });
});

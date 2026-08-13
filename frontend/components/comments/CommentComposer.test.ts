import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import CommentComposer from "./CommentComposer.vue";
import type { Comment } from "../../composables/useApiClient";

const createComment = vi.fn<(taskId: string, body: string) => Promise<Comment>>();
const updateComment =
  vi.fn<(taskId: string, commentId: string, body: string) => Promise<Comment>>();

vi.mock("../../composables/useApiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../composables/useApiClient")>();
  return {
    ...actual,
    useApiClient: () => ({ createComment, updateComment }),
  };
});

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "comment-1",
    taskId: "task-1",
    authorUserId: "user-1",
    body: "投稿本文",
    editedAt: null,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("CommentComposer", () => {
  beforeEach(() => {
    createComment.mockReset();
    updateComment.mockReset();
  });

  it("create モードでコメントを投稿し、成功したコメントを emit する", async () => {
    const created = makeComment();
    createComment.mockResolvedValue(created);
    const wrapper = mount(CommentComposer, {
      props: { taskId: "task-1", mode: "create" },
    });

    await wrapper.get("textarea").setValue("投稿本文");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(createComment).toHaveBeenCalledWith("task-1", "投稿本文");
    expect(updateComment).not.toHaveBeenCalled();
    expect(wrapper.emitted("success")).toEqual([[created]]);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("");

    await wrapper.setProps({
      mode: "edit",
      commentId: created.id,
      initialBody: created.body,
    });

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("投稿本文");
    expect(wrapper.get('button[type="submit"]').text()).toBe("更新");
  });

  it("edit モードで既存本文を表示し、コメントを更新する", async () => {
    const updated = makeComment({
      body: "編集後",
      editedAt: "2026-08-12T00:10:00.000Z",
    });
    updateComment.mockResolvedValue(updated);
    const wrapper = mount(CommentComposer, {
      props: {
        taskId: "task-1",
        mode: "edit",
        commentId: "comment-1",
        initialBody: "編集前",
      },
    });

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("編集前");
    await wrapper.get("textarea").setValue("編集後");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(updateComment).toHaveBeenCalledWith("task-1", "comment-1", "編集後");
    expect(createComment).not.toHaveBeenCalled();
    expect(wrapper.emitted("success")).toEqual([[updated]]);
  });

  it.each(["", "   ", "\n\t"])("空白だけの本文 %j は送信しない", async (body) => {
    const wrapper = mount(CommentComposer, {
      props: { taskId: "task-1", mode: "create" },
    });

    await wrapper.get("textarea").setValue(body);
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(createComment).not.toHaveBeenCalled();
    expect(updateComment).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain("コメントを入力してください");
    expect(wrapper.emitted("success")).toBeUndefined();
  });

  it("API エラーを画面内に表示する", async () => {
    createComment.mockRejectedValue(new Error("コメントを投稿できませんでした"));
    const wrapper = mount(CommentComposer, {
      props: { taskId: "task-1", mode: "create" },
    });

    await wrapper.get("textarea").setValue("投稿本文");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("コメントを投稿できませんでした");
    expect(wrapper.emitted("success")).toBeUndefined();
  });

  it("create モードで Ctrl+Enter のヒントを出し、ショートカットで投稿する", async () => {
    const created = makeComment();
    createComment.mockResolvedValue(created);
    const wrapper = mount(CommentComposer, {
      props: { taskId: "task-1", mode: "create" },
    });

    expect(wrapper.text()).toContain("Ctrl + Enter で投稿");
    expect(wrapper.get("textarea").attributes("placeholder")).toBe("コメントを入力…");
    await wrapper.get("textarea").setValue("投稿本文");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter", ctrlKey: true });
    await flushPromises();

    expect(createComment).toHaveBeenCalledWith("task-1", "投稿本文");
    expect(wrapper.emitted("success")).toEqual([[created]]);
  });

  it("Enter だけでは改行相当として投稿しない", async () => {
    const wrapper = mount(CommentComposer, {
      props: { taskId: "task-1", mode: "create" },
    });

    await wrapper.get("textarea").setValue("投稿本文");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(createComment).not.toHaveBeenCalled();
    expect(wrapper.emitted("success")).toBeUndefined();
  });

  it("edit モードはショートカット説明を出さず、Ctrl+Enter で更新する", async () => {
    const updated = makeComment({ body: "編集後" });
    updateComment.mockResolvedValue(updated);
    const wrapper = mount(CommentComposer, {
      props: {
        taskId: "task-1",
        mode: "edit",
        commentId: "comment-1",
        initialBody: "編集前",
      },
    });

    expect(wrapper.text()).not.toContain("Ctrl + Enter");
    expect(wrapper.get("button[type='submit']").text()).toBe("更新");
    expect(wrapper.get("button[type='button']").text()).toBe("キャンセル");
    await wrapper.get("textarea").setValue("編集後");
    await wrapper.get("textarea").trigger("keydown", { key: "Enter", ctrlKey: true });
    await flushPromises();

    expect(updateComment).toHaveBeenCalledWith("task-1", "comment-1", "編集後");
  });

  it("edit モードのキャンセルは API を呼ばず cancel を emit する", async () => {
    const wrapper = mount(CommentComposer, {
      props: {
        taskId: "task-1",
        mode: "edit",
        commentId: "comment-1",
        initialBody: "編集前",
      },
    });

    await wrapper.get("button[type='button']").trigger("click");

    expect(updateComment).not.toHaveBeenCalled();
    expect(wrapper.emitted("cancel")).toEqual([[]]);
  });
});

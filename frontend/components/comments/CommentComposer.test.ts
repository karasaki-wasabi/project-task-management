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
    expect(wrapper.get('button[type="submit"]').text()).toBe("保存");
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
});

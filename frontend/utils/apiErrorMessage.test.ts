import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./apiErrorMessage";

describe("apiErrorMessage", () => {
  it("ofetch の 409 本文から未完了子タスクの拒否理由を日本語にする", () => {
    const caught = Object.assign(
      new Error(
        '[PATCH] "http://localhost:3400/api/tasks/task-1/development-stage": 409 Conflict',
      ),
      {
        statusCode: 409,
        data: { error: "Task has incomplete children: task-1" },
      },
    );

    expect(apiErrorMessage(caught)).toBe(
      "未完了の子タスクがあるため完了にできません。子タスクを完了または中止してください。",
    );
  });

  it("本文が取れない ofetch メッセージはそのまま返す", () => {
    const caught = new Error(
      '[PATCH] "http://localhost:3400/api/tasks/task-1/development-stage": 409 Conflict',
    );

    expect(apiErrorMessage(caught)).toBe(caught.message);
  });

  it("その他の API 本文は翻訳せず返す", () => {
    const caught = Object.assign(new Error("ignored"), {
      data: { error: "Task is deleted: task-1" },
    });

    expect(apiErrorMessage(caught)).toBe("Task is deleted: task-1");
  });
});

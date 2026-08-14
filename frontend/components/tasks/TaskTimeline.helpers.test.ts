import { describe, expect, it } from "vitest";
import type { TaskTimelineChange } from "../../composables/useApiClient";
import {
  changeMessageSegments,
  formatTimelineDate,
  formatTimelineTime,
  groupTimelineByDate,
  timelineValueChip,
} from "./TaskTimeline.helpers";

function change(overrides: Partial<TaskTimelineChange> = {}): TaskTimelineChange {
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

function resolve(_fieldName: TaskTimelineChange["fieldName"], value: string): string {
  return value;
}

describe("formatTimelineDate / formatTimelineTime", () => {
  it("日付は YYYY/MM/DD、同日内の時刻は HH:mm にする", () => {
    const iso = "2026-08-11T01:02:00.000Z";
    const date = new Date(iso);
    const expectedDate = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    const expectedTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

    expect(formatTimelineDate(iso)).toBe(expectedDate);
    expect(formatTimelineTime(iso)).toBe(expectedTime);
  });
});

describe("groupTimelineByDate", () => {
  it("新しい順の項目を日付見出しの塊に分ける", () => {
    const later = { occurredAt: "2026-08-12T10:00:00.000Z" };
    const earlierSameDay = { occurredAt: "2026-08-12T08:00:00.000Z" };
    const previousDay = { occurredAt: "2026-08-11T10:00:00.000Z" };

    const groups = groupTimelineByDate([later, earlierSameDay, previousDay]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.date).toBe(formatTimelineDate(later.occurredAt));
    expect(groups[0]?.items).toEqual([later, earlierSameDay]);
    expect(groups[1]?.date).toBe(formatTimelineDate(previousDay.occurredAt));
    expect(groups[1]?.items).toEqual([previousDay]);
  });
});

describe("avatarInitial", () => {
  it("コメント投稿者アバター置き換え後は公開しない", async () => {
    const helpers = await import("./TaskTimeline.helpers");
    expect(helpers).not.toHaveProperty("avatarInitial");
  });
});

describe("timelineValueChip", () => {
  it("未設定・ステータス・優先度・終了予定日をモックどおりの表示値にする", () => {
    expect(timelineValueChip("assignee", null, resolve)).toEqual({
      label: "未設定",
      tone: "unset",
    });
    expect(timelineValueChip("status", "not_started", resolve)).toEqual({
      label: "未着手",
      tone: "neutral",
    });
    expect(timelineValueChip("status", "in_progress", resolve)).toEqual({
      label: "作業中",
      tone: "info",
    });
    expect(timelineValueChip("priority", "medium", resolve)).toEqual({
      label: "中",
      tone: "outline",
    });
    expect(timelineValueChip("scheduledEndDate", "2026-08-14T00:00:00.000Z", resolve)).toEqual({
      label: "2026/08/14",
      tone: "neutral",
    });
  });
});

describe("changeMessageSegments", () => {
  it("前後値がある変更はチップ付きの文言にする", () => {
    const segments = changeMessageSegments(
      change({ fieldName: "scheduledEndDate", beforeValue: null, afterValue: "2026-08-14" }),
      "山田 太郎",
      resolve,
    );

    expect(segments).toEqual([
      { kind: "text", text: "山田 太郎 が終了予定日を " },
      { kind: "chip", chip: { label: "未設定", tone: "unset" } },
      { kind: "text", text: " から " },
      { kind: "chip", chip: { label: "2026/08/14", tone: "neutral" } },
      { kind: "text", text: " に変更しました" },
    ]);
  });

  it("詳細と必須タスクは前後値を出さない", () => {
    expect(changeMessageSegments(change({ fieldName: "detail" }), "佐藤 健", resolve)).toEqual([
      { kind: "text", text: "佐藤 健 が詳細を更新しました" },
    ]);
    expect(
      changeMessageSegments(
        change({ fieldName: "isRequiredForCase", afterValue: "true" }),
        "田中 美咲",
        resolve,
      ),
    ).toEqual([{ kind: "text", text: "田中 美咲 がこのタスクを必須タスクに設定しました" }]);
  });
});

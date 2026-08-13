import type { Priority, TaskStatus, TaskTimelineChange } from "../../composables/useApiClient";
import { STATUS_BADGE_CONFIG } from "../shared/StatusBadge.helpers";

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const PRIORITY_TONES: Record<Priority, TimelineChipTone> = {
  high: "danger",
  medium: "outline",
  low: "neutral",
};

const FIELD_NOUN: Record<Exclude<TaskTimelineChange["fieldName"], "detail" | "isRequiredForCase">, string> = {
  title: "タイトル",
  status: "ステータス",
  priority: "優先度",
  assignee: "担当者",
  case: "案件",
  developmentStage: "開発段階",
  parentTask: "親タスク",
  scheduledEndDate: "終了予定日",
};

export type TimelineChipTone =
  | "unset"
  | "neutral"
  | "info"
  | "handoff"
  | "warning"
  | "danger"
  | "outline";

export interface TimelineChip {
  label: string;
  tone: TimelineChipTone;
}

export type ChangeMessageSegment =
  | { kind: "text"; text: string }
  | { kind: "chip"; chip: TimelineChip };

export interface TimelineDateGroup<T extends { occurredAt: string }> {
  date: string;
  items: T[];
}

function isTaskStatus(value: string): value is TaskStatus {
  return value in STATUS_BADGE_CONFIG;
}

function isPriority(value: string): value is Priority {
  return value in PRIORITY_LABELS;
}

export function formatTimelineDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export function formatTimelineTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function groupTimelineByDate<T extends { occurredAt: string }>(
  items: T[],
): TimelineDateGroup<T>[] {
  const groups: TimelineDateGroup<T>[] = [];
  for (const item of items) {
    const date = formatTimelineDate(item.occurredAt);
    const last = groups[groups.length - 1];
    if (last?.date === date) {
      last.items.push(item);
    } else {
      groups.push({ date, items: [item] });
    }
  }
  return groups;
}

export function avatarInitial(name: string): string {
  const trimmed = name.trim();
  return [...trimmed][0] ?? "";
}

function formatSlashDateValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value;
}

export function timelineValueChip(
  fieldName: TaskTimelineChange["fieldName"],
  value: string | null,
  resolve: (fieldName: TaskTimelineChange["fieldName"], value: string) => string,
): TimelineChip {
  if (value == null) return { label: "未設定", tone: "unset" };
  if (fieldName === "status" && isTaskStatus(value)) {
    const config = STATUS_BADGE_CONFIG[value];
    return { label: config.label, tone: config.tone };
  }
  if (fieldName === "priority" && isPriority(value)) {
    return { label: PRIORITY_LABELS[value], tone: PRIORITY_TONES[value] };
  }
  if (fieldName === "scheduledEndDate") {
    return { label: formatSlashDateValue(value), tone: "neutral" };
  }
  return { label: resolve(fieldName, value), tone: "neutral" };
}

export function timelineChipClass(tone: TimelineChipTone): string {
  switch (tone) {
    case "unset":
      return "rounded-full bg-slate-100 px-2 py-px text-xs text-slate-400";
    case "info":
      return "rounded-full bg-blue-50 px-2 py-px text-xs text-primary-700";
    case "handoff":
      return "rounded-full bg-[#ccfbf1] px-2 py-px text-xs text-[#0f766e]";
    case "warning":
      return "rounded-full bg-amber-100 px-2 py-px text-xs text-amber-800";
    case "danger":
      return "rounded-full bg-red-100 px-2 py-px text-xs text-red-700";
    case "outline":
      return "rounded-full border border-slate-300 bg-white px-2 py-px text-xs text-slate-600";
    default:
      return "rounded-full bg-slate-100 px-2 py-px text-xs text-slate-600";
  }
}

export function changeMessageSegments(
  change: TaskTimelineChange,
  actor: string,
  resolve: (fieldName: TaskTimelineChange["fieldName"], value: string) => string,
): ChangeMessageSegment[] {
  const text = (value: string): ChangeMessageSegment => ({ kind: "text", text: value });
  const chip = (value: string | null): ChangeMessageSegment => ({
    kind: "chip",
    chip: timelineValueChip(change.fieldName, value, resolve),
  });

  if (change.fieldName === "detail") {
    return [text(`${actor} が詳細を更新しました`)];
  }
  if (change.fieldName === "isRequiredForCase") {
    return [
      text(
        change.afterValue === "true"
          ? `${actor} がこのタスクを必須タスクに設定しました`
          : `${actor} が必須タスクの設定を解除しました`,
      ),
    ];
  }

  const verb = change.fieldName === "developmentStage" ? "に移しました" : "に変更しました";
  const noun = FIELD_NOUN[change.fieldName];
  return [
    text(`${actor} が${noun}を `),
    chip(change.beforeValue),
    text(" から "),
    chip(change.afterValue),
    text(` ${verb}`),
  ];
}

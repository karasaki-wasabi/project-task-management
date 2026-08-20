import type { TaskStatus } from "../../composables/useApiClient";

export type StatusBadgeTone = "neutral" | "info" | "handoff" | "warning";

export interface StatusBadgeConfig {
  tone: StatusBadgeTone;
  label: string;
}

export const STATUS_BADGE_CONFIG: Record<TaskStatus, StatusBadgeConfig> = {
  not_started: { tone: "neutral", label: "未着手" },
  in_progress: { tone: "info", label: "作業中" },
  ready_for_handoff: { tone: "handoff", label: "引継待ち" },
  on_hold: { tone: "warning", label: "保留" },
};

export function statusBadgeConfig(status: TaskStatus): StatusBadgeConfig {
  return STATUS_BADGE_CONFIG[status];
}

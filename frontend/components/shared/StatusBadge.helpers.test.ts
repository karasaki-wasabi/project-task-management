import { describe, expect, it } from "vitest";
import type { TaskStatus } from "../../composables/useApiClient";
import { STATUS_BADGE_CONFIG, statusBadgeConfig } from "./StatusBadge.helpers";

const ALL_STATUSES: TaskStatus[] = ["not_started", "in_progress", "ready_for_handoff", "on_hold"];

describe("STATUS_BADGE_CONFIG", () => {
  it("TaskStatus 値を表示し、ラベルを確認する", () => {
    expect(Object.keys(STATUS_BADGE_CONFIG).sort()).toEqual([...ALL_STATUSES].sort());
    const labels = ALL_STATUSES.map((status) => statusBadgeConfig(status).label);
    expect(labels).toEqual(["未着手", "作業中", "引継待ち", "保留"]);
    expect(new Set(labels).size).toBe(4);
  });

  it("異なるトーンを使用するため、4つのステータスが視覚的に区別される", () => {
    const tones = ALL_STATUSES.map((status) => statusBadgeConfig(status).tone);
    expect(tones).toEqual(["neutral", "info", "handoff", "warning"]);
    expect(new Set(tones).size).toBe(4);
  });
});

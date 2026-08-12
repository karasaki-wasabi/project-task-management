// task-status-model 4.1 — StatusBadge vocabulary and tones (Requirements 8.2, 8.3).
import { describe, expect, it } from "vitest";
import type { TaskStatus } from "../../composables/useApiClient";
import { STATUS_BADGE_CONFIG, statusBadgeConfig } from "./StatusBadge.helpers";

const ALL_STATUSES: TaskStatus[] = ["not_started", "in_progress", "ready_for_handoff", "on_hold"];

describe("STATUS_BADGE_CONFIG (task-status-model 4.1)", () => {
  it("covers exactly the four TaskStatus values with distinct labels", () => {
    expect(Object.keys(STATUS_BADGE_CONFIG).sort()).toEqual([...ALL_STATUSES].sort());
    const labels = ALL_STATUSES.map((status) => statusBadgeConfig(status).label);
    expect(labels).toEqual(["未着手", "作業中", "引継待ち", "保留"]);
    expect(new Set(labels).size).toBe(4);
  });

  it("maps ready_for_handoff to handoff tone and never uses success", () => {
    expect(statusBadgeConfig("ready_for_handoff")).toEqual({
      tone: "handoff",
      label: "引継待ち",
    });
    for (const status of ALL_STATUSES) {
      expect(statusBadgeConfig(status).tone).not.toBe("success");
    }
  });

  it("uses distinct tones so the four statuses remain visually distinguishable", () => {
    const tones = ALL_STATUSES.map((status) => statusBadgeConfig(status).tone);
    expect(tones).toEqual(["neutral", "info", "handoff", "warning"]);
    expect(new Set(tones).size).toBe(4);
  });
});

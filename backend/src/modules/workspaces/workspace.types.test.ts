import { describe, expect, it } from "vitest";
import {
  WORKSPACE_COLORS,
  type Workspace,
  type WorkspaceColor,
  type WorkspaceUserSummary,
} from "./workspace.types.js";

describe("WORKSPACE_COLORS (task 1.3)", () => {
  it("WORKSPACE_COLORS で exactly six fixed identification colors をエクスポート", () => {
    expect(WORKSPACE_COLORS).toEqual([
      "#2563eb",
      "#0f766e",
      "#b45309",
      "#be123c",
      "#6d28d9",
      "#475569",
    ]);
    expect(WORKSPACE_COLORS).toHaveLength(6);
  });

  it("WORKSPACE_COLORS で WorkspaceColor を固定パレットに制限", () => {
    const color: WorkspaceColor = WORKSPACE_COLORS[0];
    expect(WORKSPACE_COLORS.includes(color)).toBe(true);
  });
});

describe("Workspace / WorkspaceUserSummary type shapes (task 1.3)", () => {
  it("Workspace / WorkspaceUserSummary 型で deletedAt がない Workspace を受け入れる (domain shape per design)", () => {
    const workspace: Workspace = {
      id: "ws-1",
      name: "Demo",
      color: "#2563eb",
      createdByUserId: "user-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    expect(workspace.color).toBe("#2563eb");
    expect("deletedAt" in workspace).toBe(false);
  });

  it("Workspace / WorkspaceUserSummary 型で userId, name, email を持つ WorkspaceUserSummary を受け入れる", () => {
    const summary: WorkspaceUserSummary = {
      userId: "user-1",
      name: "Alice",
      email: "alice@example.com",
    };
    expect(summary).toEqual({
      userId: "user-1",
      name: "Alice",
      email: "alice@example.com",
    });
  });
});

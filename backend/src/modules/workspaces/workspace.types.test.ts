// RED→GREEN: Workspace domain types & fixed color palette
// (task 1.3, design.md WorkspaceService Service Interface; Requirements 1.1, 6.3, 6.4).
import { describe, expect, it } from "vitest";
import {
  WORKSPACE_COLORS,
  type Workspace,
  type WorkspaceColor,
  type WorkspaceUserSummary,
} from "./workspace.types.js";

describe("WORKSPACE_COLORS (task 1.3)", () => {
  it("exports exactly six fixed identification colors", () => {
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

  it("narrows WorkspaceColor to the fixed palette", () => {
    const color: WorkspaceColor = WORKSPACE_COLORS[0];
    expect(WORKSPACE_COLORS.includes(color)).toBe(true);
  });
});

describe("Workspace / WorkspaceUserSummary type shapes (task 1.3)", () => {
  it("accepts a Workspace without deletedAt (domain shape per design)", () => {
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

  it("accepts a WorkspaceUserSummary with userId, name, email", () => {
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

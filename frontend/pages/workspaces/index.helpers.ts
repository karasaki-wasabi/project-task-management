// Pure derived-data logic for the workspaces index page (task 6.3,
// design.md pages/workspaces, Requirements 2.3, 3.1, 3.2). Extracted so
// view-state resolution can be unit-tested without mounting the SFC —
// same pattern as frontend/pages/cases/index.helpers.ts.
import type { Workspace } from "../../composables/useApiClient";

export type WorkspacesPageView = "empty" | "members";

// Requirement 2.3: no current workspace → empty state card.
// Requirement 3.1: current workspace selected → member list view.
export function resolvePageView(currentId: string | null): WorkspacesPageView {
  return currentId === null ? "empty" : "members";
}

export function findCurrentWorkspace(
  workspaces: Workspace[],
  currentId: string | null,
): Workspace | null {
  if (currentId === null) return null;
  return workspaces.find((workspace) => workspace.id === currentId) ?? null;
}

// research.md メンバー一覧: 下部に「メンバー N人」
export function formatMemberCount(count: number): string {
  return `メンバー ${count}人`;
}

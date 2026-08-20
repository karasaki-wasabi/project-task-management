import type { Workspace } from "../../composables/useApiClient";

export type WorkspacesPageView = "empty" | "members";

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

export function isWorkspaceCreator(
  workspace: Workspace | null,
  userId: string | null | undefined,
): boolean {
  if (workspace === null || userId == null || userId === "") return false;
  return workspace.createdByUserId === userId;
}

export function formatMemberCount(count: number): string {
  return `メンバー ${count}人`;
}

export function normalizeMemberSearchQuery(query: string): string {
  return query.trim();
}

export function shouldRunMemberSearch(query: string): boolean {
  return normalizeMemberSearchQuery(query).length > 0;
}

export function shouldShowMemberSearchEmpty(state: {
  searched: boolean;
  loading: boolean;
  resultCount: number;
}): boolean {
  return state.searched && !state.loading && state.resultCount === 0;
}


export const WORKSPACE_COLORS = [
  "#2563eb",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#6d28d9",
  "#475569",
] as const;

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

export interface Workspace {
  id: string;
  name: string;
  color: WorkspaceColor;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceUserSummary {
  userId: string;
  name: string;
  email: string;
}

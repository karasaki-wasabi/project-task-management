// Workspace domain types (task 1.3, design.md WorkspaceService Service
// Interface; Requirements 1.1, 6.3, 6.4). Domain Workspace omits deletedAt
// (Prisma model has it; soft-delete stays at the repository boundary).

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

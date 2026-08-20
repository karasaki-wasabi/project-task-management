export const WORKSPACE_HEADER_NAME = "x-workspace-id";

export type VerifiedWorkspaceId = string & { readonly __brand: "VerifiedWorkspaceId" };

export interface WorkspaceScopedWhere {
  workspaceId: VerifiedWorkspaceId;
}

export function withWorkspaceScope<T extends object>(
  where: T,
  workspaceId: VerifiedWorkspaceId,
): T & WorkspaceScopedWhere {
  return { ...where, workspaceId };
}

/** HTTP header name for the current workspace context (lowercase Fastify form). */
export const WORKSPACE_HEADER_NAME = "x-workspace-id";

/**
 * Branded string that has passed requireWorkspaceMember verification.
 * Construct only via that guard (or an explicit `as VerifiedWorkspaceId` cast).
 */
export type VerifiedWorkspaceId = string & { readonly __brand: "VerifiedWorkspaceId" };

export interface WorkspaceScopedWhere {
  workspaceId: VerifiedWorkspaceId;
}

/** Merge a verified workspaceId into a Prisma-style where clause. */
export function withWorkspaceScope<T extends object>(
  where: T,
  workspaceId: VerifiedWorkspaceId,
): T & WorkspaceScopedWhere {
  return { ...where, workspaceId };
}

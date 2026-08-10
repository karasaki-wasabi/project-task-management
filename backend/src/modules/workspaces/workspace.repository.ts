// Persistence for Workspaces (task 2.1, design.md "Backend/workspaces"
// workspace.repository; Requirements 1.1, 2.4, 3.1, 6.1, 6.3, 7.1, 7.4).
// Soft-delete / audit-column behavior comes from the shared `db` client.
// Optional DbClient lets WorkspaceService create workspace + creator membership
// in the same TX (task 3.1). Business rules stay in the service layer.
import { db } from "../../shared/db.js";
import type { DbClient } from "../../shared/soft-delete.repository.js";
import type { Workspace, WorkspaceColor, WorkspaceUserSummary } from "./workspace.types.js";

export interface WorkspaceMemberRecord {
  id: string;
  workspaceId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

function toWorkspace(row: {
  id: string;
  name: string;
  color: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}): Workspace {
  return {
    id: row.id,
    name: row.name,
    color: row.color as WorkspaceColor,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const workspaceRepository = {
  createWorkspace(
    input: { name: string; createdByUserId: string; color?: WorkspaceColor },
    client: DbClient = db,
  ): Promise<Workspace> {
    return client.workspace
      .create({
        data: {
          name: input.name,
          createdByUserId: input.createdByUserId,
          ...(input.color !== undefined ? { color: input.color } : {}),
        },
      })
      .then(toWorkspace);
  },

  createMember(
    input: { workspaceId: string; userId: string },
    client: DbClient = db,
  ): Promise<WorkspaceMemberRecord> {
    return client.workspaceMember.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
    });
  },

  findById(id: string, client: DbClient = db): Promise<Workspace | null> {
    return client.workspace.findUnique({ where: { id } }).then((row) => (row ? toWorkspace(row) : null));
  },

  update(
    id: string,
    data: Partial<{ name: string; color: WorkspaceColor }>,
    client: DbClient = db,
  ): Promise<Workspace> {
    return client.workspace.update({ where: { id }, data }).then(toWorkspace);
  },

  /** Workspaces the user currently belongs to (active memberships only). */
  listByUserId(userId: string): Promise<Workspace[]> {
    return db.workspace
      .findMany({
        // Nested relation filters bypass the soft-delete extension's default
        // filter, so active memberships must be selected explicitly.
        where: { members: { some: { userId, deletedAt: null } } },
        orderBy: { createdAt: "asc" },
      })
      .then((rows) => rows.map(toWorkspace));
  },

  listMembers(workspaceId: string): Promise<WorkspaceUserSummary[]> {
    return db.workspaceMember
      .findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true } } },
      })
      .then((rows) =>
        rows.map((row) => ({
          userId: row.user.id,
          name: row.user.name,
          email: row.user.email,
        })),
      );
  },

  isMember(workspaceId: string, userId: string): Promise<boolean> {
    return db.workspaceMember
      .findFirst({ where: { workspaceId, userId } })
      .then((row) => row !== null);
  },

  // design.md Workspace deletion flow: soft-delete members first, then the
  // workspace, in one transaction (soft-delete extension converts delete*).
  delete(id: string): Promise<void> {
    return db.$transaction(async (tx) => {
      await tx.workspaceMember.deleteMany({ where: { workspaceId: id } });
      await tx.workspace.delete({ where: { id } });
    });
  },
};

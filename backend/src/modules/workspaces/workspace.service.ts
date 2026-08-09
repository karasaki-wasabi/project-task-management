// WorkspaceService: create / settings update / creator-only delete / list /
// member list / search-add / isMember (tasks 3.1–3.2, design.md
// "Backend/workspaces" WorkspaceService; Requirements 1.1, 1.2, 3.1, 3.2,
// 4.2–4.5, 5.1, 5.2, 6.1–6.5, 7.1–7.3).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { badRequest, forbidden, notFound } from "../../shared/http-errors.js";
import { usersService } from "../users/user.service.js";
import { workspaceRepository } from "./workspace.repository.js";
import {
  WORKSPACE_COLORS,
  type Workspace,
  type WorkspaceColor,
  type WorkspaceUserSummary,
} from "./workspace.types.js";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

function assertNonEmptyName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw badRequest("name is required");
  }
  return trimmed;
}

function assertWorkspaceColor(color: string): asserts color is WorkspaceColor {
  if (!(WORKSPACE_COLORS as readonly string[]).includes(color)) {
    throw badRequest(`color must be one of: ${WORKSPACE_COLORS.join(", ")}`);
  }
}

export const workspaceService = {
  async create(
    input: { name: string; createdByUserId: string },
    requestId: string = randomUUID(),
  ): Promise<Workspace> {
    const name = assertNonEmptyName(input.name);

    const workspace = await db.$transaction(async (tx) => {
      const created = await workspaceRepository.createWorkspace(
        { name, createdByUserId: input.createdByUserId },
        tx,
      );
      await workspaceRepository.createMember(
        { workspaceId: created.id, userId: input.createdByUserId },
        tx,
      );
      return created;
    });

    businessEventLogger.logBusinessEvent("workspace.created", {
      requestId,
      entityId: workspace.id,
    });
    return workspace;
  },

  async update(
    id: string,
    input: { name?: string; color?: WorkspaceColor },
    requestingUserId: string,
    requestId: string = randomUUID(),
  ): Promise<Workspace> {
    const current = await workspaceRepository.findById(id);
    if (!current) {
      throw notFound(`Workspace not found: ${id}`);
    }

    const member = await workspaceRepository.isMember(id, requestingUserId);
    if (!member) {
      throw forbidden("Only workspace members can update workspace settings");
    }

    const data: Partial<{ name: string; color: WorkspaceColor }> = {};
    if (input.name !== undefined) {
      data.name = assertNonEmptyName(input.name);
    }
    if (input.color !== undefined) {
      assertWorkspaceColor(input.color);
      data.color = input.color;
    }

    const updated = await workspaceRepository.update(id, data);
    businessEventLogger.logBusinessEvent("workspace.updated", {
      requestId,
      entityId: updated.id,
    });
    return updated;
  },

  async delete(
    id: string,
    requestingUserId: string,
    requestId: string = randomUUID(),
  ): Promise<void> {
    const current = await workspaceRepository.findById(id);
    if (!current) {
      throw notFound(`Workspace not found: ${id}`);
    }

    const member = await workspaceRepository.isMember(id, requestingUserId);
    if (!member) {
      // Requirement 7.3 / design deletion flow: non-member → 404 (not 403).
      throw notFound(`Workspace not found: ${id}`);
    }

    if (current.createdByUserId !== requestingUserId) {
      throw forbidden("Only the workspace creator can delete the workspace");
    }

    await workspaceRepository.delete(id);
    businessEventLogger.logBusinessEvent("workspace.deleted", {
      requestId,
      entityId: id,
    });
  },

  list(userId: string): Promise<Workspace[]> {
    return workspaceRepository.listByUserId(userId);
  },

  isMember(id: string, userId: string): Promise<boolean> {
    return workspaceRepository.isMember(id, userId);
  },

  async listMembers(id: string, requestingUserId: string): Promise<WorkspaceUserSummary[]> {
    const current = await workspaceRepository.findById(id);
    if (!current) {
      throw notFound(`Workspace not found: ${id}`);
    }

    if (!(await workspaceRepository.isMember(id, requestingUserId))) {
      throw forbidden("Only workspace members can list members");
    }

    return workspaceRepository.listMembers(id);
  },

  async searchAddableUsers(
    id: string,
    query: string,
    requestingUserId: string,
  ): Promise<WorkspaceUserSummary[]> {
    const current = await workspaceRepository.findById(id);
    if (!current) {
      throw notFound(`Workspace not found: ${id}`);
    }

    if (!(await workspaceRepository.isMember(id, requestingUserId))) {
      throw forbidden("Only workspace members can search addable users");
    }

    if (query.trim().length === 0) {
      return [];
    }

    const [users, members] = await Promise.all([
      usersService.search(query),
      workspaceRepository.listMembers(id),
    ]);
    const memberIds = new Set(members.map((m) => m.userId));

    return users
      .filter((user) => !memberIds.has(user.id))
      .map((user) => ({
        userId: user.id,
        name: user.name,
        email: user.email,
      }));
  },

  async addMember(
    id: string,
    targetUserId: string,
    requestingUserId: string,
    requestId: string = randomUUID(),
  ): Promise<WorkspaceUserSummary> {
    const current = await workspaceRepository.findById(id);
    if (!current) {
      throw notFound(`Workspace not found: ${id}`);
    }

    if (!(await workspaceRepository.isMember(id, requestingUserId))) {
      throw forbidden("Only workspace members can add members");
    }

    try {
      await workspaceRepository.createMember({ workspaceId: id, userId: targetUserId });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw badRequest("User is already a member of this workspace");
      }
      if (isForeignKeyConstraintError(error)) {
        throw notFound(`User not found: ${targetUserId}`);
      }
      throw error;
    }

    const members = await workspaceRepository.listMembers(id);
    const added = members.find((m) => m.userId === targetUserId);
    if (!added) {
      throw notFound(`User not found: ${targetUserId}`);
    }

    businessEventLogger.logBusinessEvent("workspace.member_added", {
      requestId,
      entityId: id,
    });
    return added;
  },
};

// WorkspaceService: create / settings update / creator-only delete / list
// (task 3.1, design.md "Backend/workspaces" WorkspaceService; Requirements
// 1.1, 1.2, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3).
import { randomUUID } from "node:crypto";
import { businessEventLogger } from "../../shared/business-event-logger.js";
import { db } from "../../shared/db.js";
import { badRequest, forbidden, notFound } from "../../shared/http-errors.js";
import { workspaceRepository } from "./workspace.repository.js";
import { WORKSPACE_COLORS, type Workspace, type WorkspaceColor } from "./workspace.types.js";

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
};

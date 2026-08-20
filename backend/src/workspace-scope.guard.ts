import type { FastifyRequest } from "fastify";
import { badRequest, forbidden, unauthorized } from "./shared/http-errors.js";
import {
  WORKSPACE_HEADER_NAME,
  type VerifiedWorkspaceId,
} from "./shared/workspace-scope.js";
import { workspaceService } from "./modules/workspaces/workspace.service.js";

declare module "fastify" {
  interface FastifyRequest {
    currentWorkspaceId?: VerifiedWorkspaceId;
  }
}

function asVerifiedWorkspaceId(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

function readWorkspaceHeader(request: FastifyRequest): string | undefined {
  const raw = request.headers[WORKSPACE_HEADER_NAME];
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

export async function requireWorkspaceMember(request: FastifyRequest): Promise<void> {
  if (!request.currentUser) {
    throw unauthorized("ログインが必要です。");
  }

  const workspaceId = readWorkspaceHeader(request);
  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    throw badRequest("X-Workspace-Id header is required");
  }

  const isMember = await workspaceService.isMember(workspaceId, request.currentUser.id);
  if (!isMember) {
    throw forbidden("Not a member of the specified workspace");
  }

  request.currentWorkspaceId = asVerifiedWorkspaceId(workspaceId);
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import { HttpError } from "./shared/http-errors.js";
import { WORKSPACE_HEADER_NAME, type VerifiedWorkspaceId } from "./shared/workspace-scope.js";

vi.mock("./modules/workspaces/workspace.service.js", () => ({
  workspaceService: {
    isMember: vi.fn(),
  },
}));

import { workspaceService } from "./modules/workspaces/workspace.service.js";
import { requireWorkspaceMember } from "./workspace-scope.guard.js";

function buildRequest(options: {
  headers?: Record<string, string | string[] | undefined>;
  currentUser?: { id: string };
}): FastifyRequest {
  return {
    headers: options.headers ?? {},
    currentUser: options.currentUser,
  } as unknown as FastifyRequest;
}

describe("requireWorkspaceMember (task 1.3)", () => {
  beforeEach(() => {
    vi.mocked(workspaceService.isMember).mockReset();
  });

  it("returns 400 when X-Workspace-Id header is missing", async () => {
    const request = buildRequest({
      currentUser: { id: "user-1" },
      headers: {},
    });

    await expect(requireWorkspaceMember(request)).rejects.toMatchObject({
      statusCode: 400,
    } satisfies Partial<HttpError>);
    expect(workspaceService.isMember).not.toHaveBeenCalled();
    expect(request.currentWorkspaceId).toBeUndefined();
  });

  it("returns 400 when X-Workspace-Id header is empty", async () => {
    const request = buildRequest({
      currentUser: { id: "user-1" },
      headers: { [WORKSPACE_HEADER_NAME]: "" },
    });

    await expect(requireWorkspaceMember(request)).rejects.toMatchObject({
      statusCode: 400,
    } satisfies Partial<HttpError>);
    expect(workspaceService.isMember).not.toHaveBeenCalled();
    expect(request.currentWorkspaceId).toBeUndefined();
  });

  it("returns 403 when the current user is not a workspace member", async () => {
    vi.mocked(workspaceService.isMember).mockResolvedValue(false);
    const request = buildRequest({
      currentUser: { id: "user-1" },
      headers: { [WORKSPACE_HEADER_NAME]: "ws-1" },
    });

    await expect(requireWorkspaceMember(request)).rejects.toMatchObject({
      statusCode: 403,
    } satisfies Partial<HttpError>);
    expect(workspaceService.isMember).toHaveBeenCalledWith("ws-1", "user-1");
    expect(request.currentWorkspaceId).toBeUndefined();
  });

  it("attaches VerifiedWorkspaceId when the current user is a member", async () => {
    vi.mocked(workspaceService.isMember).mockResolvedValue(true);
    const request = buildRequest({
      currentUser: { id: "user-1" },
      headers: { [WORKSPACE_HEADER_NAME]: "ws-1" },
    });

    await expect(requireWorkspaceMember(request)).resolves.toBeUndefined();
    expect(workspaceService.isMember).toHaveBeenCalledWith("ws-1", "user-1");
    expect(request.currentWorkspaceId).toBe("ws-1");
    // Branded type must be usable as VerifiedWorkspaceId at the type level.
    const verified: VerifiedWorkspaceId | undefined = request.currentWorkspaceId;
    expect(verified).toBe("ws-1");
  });

  it("returns 401 when currentUser is not set (requireUser precondition)", async () => {
    const request = buildRequest({
      headers: { [WORKSPACE_HEADER_NAME]: "ws-1" },
    });

    await expect(requireWorkspaceMember(request)).rejects.toMatchObject({
      statusCode: 401,
    } satisfies Partial<HttpError>);
    expect(workspaceService.isMember).not.toHaveBeenCalled();
  });

  it("re-checks membership on every request (no cache)", async () => {
    vi.mocked(workspaceService.isMember)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const memberRequest = buildRequest({
      currentUser: { id: "user-1" },
      headers: { [WORKSPACE_HEADER_NAME]: "ws-1" },
    });
    await requireWorkspaceMember(memberRequest);
    expect(memberRequest.currentWorkspaceId).toBe("ws-1");

    const nonMemberRequest = buildRequest({
      currentUser: { id: "user-1" },
      headers: { [WORKSPACE_HEADER_NAME]: "ws-1" },
    });
    await expect(requireWorkspaceMember(nonMemberRequest)).rejects.toMatchObject({
      statusCode: 403,
    } satisfies Partial<HttpError>);
    expect(workspaceService.isMember).toHaveBeenCalledTimes(2);
  });
});

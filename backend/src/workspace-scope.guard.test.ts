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

  it("X-Workspace-Id ヘッダーがない場合、400 を返す", async () => {
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

  it("X-Workspace-Id ヘッダーが空の場合、400 を返す", async () => {
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

  it("現在のユーザーがワークスペースメンバーでない場合、403 を返す", async () => {
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

  it("現在のユーザーがワークスペースメンバーの場合、VerifiedWorkspaceId を添付", async () => {
    vi.mocked(workspaceService.isMember).mockResolvedValue(true);
    const request = buildRequest({
      currentUser: { id: "user-1" },
      headers: { [WORKSPACE_HEADER_NAME]: "ws-1" },
    });

    await expect(requireWorkspaceMember(request)).resolves.toBeUndefined();
    expect(workspaceService.isMember).toHaveBeenCalledWith("ws-1", "user-1");
    expect(request.currentWorkspaceId).toBe("ws-1");
    const verified: VerifiedWorkspaceId | undefined = request.currentWorkspaceId;
    expect(verified).toBe("ws-1");
  });

  it("currentUser が設定されていない場合、401 を返す (requireUser の前提条件)", async () => {
    const request = buildRequest({
      headers: { [WORKSPACE_HEADER_NAME]: "ws-1" },
    });

    await expect(requireWorkspaceMember(request)).rejects.toMatchObject({
      statusCode: 401,
    } satisfies Partial<HttpError>);
    expect(workspaceService.isMember).not.toHaveBeenCalled();
  });

  it("すべてのリクエストでメンバーシップを再確認する (キャッシュなし)", async () => {
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

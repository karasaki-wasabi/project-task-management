import { describe, expect, it } from "vitest";
import {
  WORKSPACE_HEADER_NAME,
  withWorkspaceScope,
  type VerifiedWorkspaceId,
} from "./workspace-scope.js";

/** Test-only cast; production code obtains this via requireWorkspaceMember. */
function asVerified(id: string): VerifiedWorkspaceId {
  return id as VerifiedWorkspaceId;
}

describe("WORKSPACE_HEADER_NAME", () => {
  it("is the lowercase X-Workspace-Id header name", () => {
    expect(WORKSPACE_HEADER_NAME).toBe("x-workspace-id");
  });
});

describe("withWorkspaceScope", () => {
  it("merges workspaceId into an empty where clause", () => {
    const workspaceId = asVerified("ws-1");
    const result = withWorkspaceScope({}, workspaceId);

    expect(result).toEqual({ workspaceId: "ws-1" });
  });

  it("preserves existing where fields and adds workspaceId", () => {
    const workspaceId = asVerified("ws-2");
    const result = withWorkspaceScope({ id: "case-1", deletedAt: null }, workspaceId);

    expect(result).toEqual({
      id: "case-1",
      deletedAt: null,
      workspaceId: "ws-2",
    });
  });

  it("overwrites a pre-existing workspaceId with the verified one", () => {
    const workspaceId = asVerified("ws-verified");
    const result = withWorkspaceScope({ workspaceId: "ws-other" }, workspaceId);

    expect(result.workspaceId).toBe("ws-verified");
  });
});

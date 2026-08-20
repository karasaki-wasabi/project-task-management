import { describe, expect, it } from "vitest";
import {
  WORKSPACE_HEADER_NAME,
  withWorkspaceScope,
  type VerifiedWorkspaceId,
} from "./workspace-scope.js";

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

  it("既存の where フィールドを保持し、workspaceId を追加する", () => {
    const workspaceId = asVerified("ws-2");
    const result = withWorkspaceScope({ id: "case-1", deletedAt: null }, workspaceId);

    expect(result).toEqual({
      id: "case-1",
      deletedAt: null,
      workspaceId: "ws-2",
    });
  });

  it("既存の workspaceId を検証済みのもので上書きする", () => {
    const workspaceId = asVerified("ws-verified");
    const result = withWorkspaceScope({ workspaceId: "ws-other" }, workspaceId);

    expect(result.workspaceId).toBe("ws-verified");
  });
});

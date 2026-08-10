import { describe, expect, it } from "vitest";
import type { Workspace } from "../../composables/useApiClient";
import {
  findCurrentWorkspace,
  formatMemberCount,
  isWorkspaceCreator,
  normalizeMemberSearchQuery,
  resolvePageView,
  shouldRunMemberSearch,
  shouldShowMemberSearchEmpty,
} from "./index.helpers";

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    name: "営業チーム",
    color: "#2563eb",
    createdByUserId: "user-1",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolvePageView (Requirements 2.3, 3.1)", () => {
  it("returns empty when currentId is null (workspace 0件 / 未選択)", () => {
    expect(resolvePageView(null)).toBe("empty");
  });

  it("returns members when a workspace is selected", () => {
    expect(resolvePageView("ws-1")).toBe("members");
  });
});

describe("findCurrentWorkspace", () => {
  const workspaces = [
    makeWorkspace({ id: "ws-1", name: "営業チーム" }),
    makeWorkspace({ id: "ws-2", name: "開発チーム" }),
  ];

  it("returns null when currentId is null", () => {
    expect(findCurrentWorkspace(workspaces, null)).toBeNull();
  });

  it("returns the matching workspace for the current id", () => {
    expect(findCurrentWorkspace(workspaces, "ws-2")).toEqual(workspaces[1]);
  });

  it("returns null when the id is not in the membership list", () => {
    expect(findCurrentWorkspace(workspaces, "missing")).toBeNull();
  });
});

describe("formatMemberCount", () => {
  it("formats the member count label as メンバー N人", () => {
    expect(formatMemberCount(0)).toBe("メンバー 0人");
    expect(formatMemberCount(3)).toBe("メンバー 3人");
  });
});

describe("isWorkspaceCreator (Requirements 7.1, 7.2)", () => {
  it("returns true only when the user id matches createdByUserId", () => {
    const ws = makeWorkspace({ createdByUserId: "user-1" });
    expect(isWorkspaceCreator(ws, "user-1")).toBe(true);
    expect(isWorkspaceCreator(ws, "user-2")).toBe(false);
  });

  it("returns false when workspace or user id is missing", () => {
    expect(isWorkspaceCreator(null, "user-1")).toBe(false);
    expect(isWorkspaceCreator(makeWorkspace(), null)).toBe(false);
    expect(isWorkspaceCreator(makeWorkspace(), undefined)).toBe(false);
    expect(isWorkspaceCreator(makeWorkspace(), "")).toBe(false);
  });
});

describe("normalizeMemberSearchQuery / shouldRunMemberSearch (Requirement 4.1)", () => {
  it("trims whitespace from the search query", () => {
    expect(normalizeMemberSearchQuery("  alice  ")).toBe("alice");
  });

  it("does not run search for blank queries (no full-list search)", () => {
    expect(shouldRunMemberSearch("")).toBe(false);
    expect(shouldRunMemberSearch("   ")).toBe(false);
    expect(shouldRunMemberSearch("alice")).toBe(true);
  });
});

describe("shouldShowMemberSearchEmpty (Requirement 4.1)", () => {
  it("shows empty message only after a completed search with zero results", () => {
    expect(shouldShowMemberSearchEmpty({ searched: false, loading: false, resultCount: 0 })).toBe(
      false,
    );
    expect(shouldShowMemberSearchEmpty({ searched: true, loading: true, resultCount: 0 })).toBe(
      false,
    );
    expect(shouldShowMemberSearchEmpty({ searched: true, loading: false, resultCount: 1 })).toBe(
      false,
    );
    expect(shouldShowMemberSearchEmpty({ searched: true, loading: false, resultCount: 0 })).toBe(
      true,
    );
  });
});

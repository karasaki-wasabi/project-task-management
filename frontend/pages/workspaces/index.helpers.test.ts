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

describe("ページ表示判定 (Requirements 2.3, 3.1)", () => {
  it("ワークスペースが未選択の場合、空状態を返す", () => {
    expect(resolvePageView(null)).toBe("empty");
  });

  it("ワークスペースが選択された場合、メンバーリストを返す", () => {
    expect(resolvePageView("ws-1")).toBe("members");
  });
});

describe("現在のワークスペースを取得", () => {
  const workspaces = [
    makeWorkspace({ id: "ws-1", name: "営業チーム" }),
    makeWorkspace({ id: "ws-2", name: "開発チーム" }),
  ];

  it("ワークスペースが未選択の場合、nullを返す", () => {
    expect(findCurrentWorkspace(workspaces, null)).toBeNull();
  });

  it("現在のIDに一致するワークスペースを返す", () => {
    expect(findCurrentWorkspace(workspaces, "ws-2")).toEqual(workspaces[1]);
  });

  it("メンバーシップリストにIDが存在しない場合、nullを返す", () => {
    expect(findCurrentWorkspace(workspaces, "missing")).toBeNull();
  });
});

describe("メンバーカウントラベルのフォーマット", () => {
  it("formats the member count label as メンバー N人", () => {
    expect(formatMemberCount(0)).toBe("メンバー 0人");
    expect(formatMemberCount(3)).toBe("メンバー 3人");
  });
});

describe("ワークスペース作成者判定 (Requirements 7.1, 7.2)", () => {
  it("ユーザーIDが作成者IDと一致する場合、trueを返す", () => {
    const ws = makeWorkspace({ createdByUserId: "user-1" });
    expect(isWorkspaceCreator(ws, "user-1")).toBe(true);
    expect(isWorkspaceCreator(ws, "user-2")).toBe(false);
  });

  it("ワークスペースまたはユーザーIDが存在しない場合、falseを返す", () => {
    expect(isWorkspaceCreator(null, "user-1")).toBe(false);
    expect(isWorkspaceCreator(makeWorkspace(), null)).toBe(false);
    expect(isWorkspaceCreator(makeWorkspace(), undefined)).toBe(false);
    expect(isWorkspaceCreator(makeWorkspace(), "")).toBe(false);
  });
});

describe("メンバー検索クエリの正規化 / 検索実行判定 (Requirement 4.1)", () => {
  it("検索クエリの空白をトリミング", () => {
    expect(normalizeMemberSearchQuery("  alice  ")).toBe("alice");
  });

  it("空白クエリの場合、検索を実行しない", () => {
    expect(shouldRunMemberSearch("")).toBe(false);
    expect(shouldRunMemberSearch("   ")).toBe(false);
    expect(shouldRunMemberSearch("alice")).toBe(true);
  });
});

describe("空状態メッセージの表示判定 (Requirement 4.1)", () => {
  it("検索結果が0件の場合、空状態メッセージを表示する", () => {
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

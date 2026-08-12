import { describe, expect, it } from "vitest";
import {
  buildNavLinks,
  parseWorkspaceRoute,
  replaceWorkspaceIdInPath,
  workspacePath,
  type WorkspacePageKind,
} from "./workspacePath";

const WORKSPACE_ID = "ws-abc";
const OTHER_ID = "ws-xyz";

const KIND_PATHS: Array<{ kind: WorkspacePageKind; path: string }> = [
  { kind: "", path: `/workspaces/${WORKSPACE_ID}` },
  { kind: "tasks", path: `/workspaces/${WORKSPACE_ID}/tasks` },
  { kind: "kanban", path: `/workspaces/${WORKSPACE_ID}/kanban` },
  { kind: "kanban/stages", path: `/workspaces/${WORKSPACE_ID}/kanban/stages` },
  { kind: "cases", path: `/workspaces/${WORKSPACE_ID}/cases` },
  { kind: "calendar", path: `/workspaces/${WORKSPACE_ID}/calendar` },
  { kind: "recurrence", path: `/workspaces/${WORKSPACE_ID}/recurrence` },
  { kind: "holidays", path: `/workspaces/${WORKSPACE_ID}/holidays` },
  { kind: "throughput", path: `/workspaces/${WORKSPACE_ID}/throughput` },
];

describe("workspacePath", () => {
  it("builds every business page path per the URL mapping table", () => {
    for (const { kind, path } of KIND_PATHS) {
      expect(workspacePath(WORKSPACE_ID, kind)).toBe(path);
    }
  });
});

describe("parseWorkspaceRoute", () => {
  it("extracts workspaceId and kind for every scoped business path", () => {
    for (const { kind, path } of KIND_PATHS) {
      expect(parseWorkspaceRoute(path)).toEqual({
        workspaceId: WORKSPACE_ID,
        kind,
      });
    }
  });

  it("returns null for auth, manage, flat business, and unknown paths", () => {
    const nonScoped = [
      "/login",
      "/register",
      "/workspaces",
      "/tasks",
      "/kanban",
      "/kanban/stages",
      "/cases",
      "/",
      "/workspaces/ws-abc/unknown",
      "/other",
    ];
    for (const path of nonScoped) {
      expect(parseWorkspaceRoute(path)).toBeNull();
    }
  });
});

describe("replaceWorkspaceIdInPath", () => {
  it("replaces workspaceId while keeping the same page kind", () => {
    for (const { kind, path } of KIND_PATHS) {
      expect(replaceWorkspaceIdInPath(path, OTHER_ID)).toBe(
        workspacePath(OTHER_ID, kind),
      );
    }
  });

  it("returns null when the path is not a scoped business path", () => {
    expect(replaceWorkspaceIdInPath("/login", OTHER_ID)).toBeNull();
    expect(replaceWorkspaceIdInPath("/workspaces", OTHER_ID)).toBeNull();
    expect(replaceWorkspaceIdInPath("/tasks", OTHER_ID)).toBeNull();
    expect(replaceWorkspaceIdInPath(`/workspaces/${WORKSPACE_ID}/unknown`, OTHER_ID)).toBeNull();
  });
});

describe("buildNavLinks", () => {
  it("returns only dashboard and members when workspaceId is null", () => {
    expect(buildNavLinks(null)).toEqual([
      { to: "/", label: "ダッシュボード" },
      { to: "/workspaces", label: "メンバー" },
    ]);
  });

  it("returns workspace-scoped business links plus manage members when scoped", () => {
    expect(buildNavLinks(WORKSPACE_ID)).toEqual([
      { to: `/workspaces/${WORKSPACE_ID}`, label: "ダッシュボード" },
      { to: `/workspaces/${WORKSPACE_ID}/tasks`, label: "タスク" },
      { to: `/workspaces/${WORKSPACE_ID}/kanban`, label: "カンバン" },
      { to: `/workspaces/${WORKSPACE_ID}/cases`, label: "案件" },
      { to: `/workspaces/${WORKSPACE_ID}/calendar`, label: "カレンダー" },
      { to: `/workspaces/${WORKSPACE_ID}/recurrence`, label: "繰り返し設定" },
      { to: `/workspaces/${WORKSPACE_ID}/throughput`, label: "消化数" },
      { to: `/workspaces/${WORKSPACE_ID}/holidays`, label: "休日マスタ" },
      { to: "/workspaces", label: "メンバー" },
    ]);
  });
});

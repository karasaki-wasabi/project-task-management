export interface NavLink {
  to: string;
  label: string;
}

export type WorkspacePageKind =
  | ""
  | "tasks"
  | "kanban"
  | "kanban/stages"
  | "cases"
  | "calendar"
  | "recurrence"
  | "holidays"
  | "throughput";

const PAGE_KINDS: WorkspacePageKind[] = [
  "kanban/stages",
  "tasks",
  "kanban",
  "cases",
  "calendar",
  "recurrence",
  "holidays",
  "throughput",
  "",
];

const KIND_SET = new Set<string>(PAGE_KINDS);

export function workspacePath(
  workspaceId: string,
  kind: WorkspacePageKind,
): string {
  const base = `/workspaces/${workspaceId}`;
  return kind === "" ? base : `${base}/${kind}`;
}

export function parseWorkspaceRoute(
  path: string,
): { workspaceId: string; kind: WorkspacePageKind } | null {
  const normalized = path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
  const prefix = "/workspaces/";
  if (!normalized.startsWith(prefix)) {
    return null;
  }

  const rest = normalized.slice(prefix.length);
  if (!rest) {
    return null;
  }

  const slash = rest.indexOf("/");
  const workspaceId = slash === -1 ? rest : rest.slice(0, slash);
  const kindPart = slash === -1 ? "" : rest.slice(slash + 1);

  if (!workspaceId || !KIND_SET.has(kindPart)) {
    return null;
  }

  return { workspaceId, kind: kindPart as WorkspacePageKind };
}

export function replaceWorkspaceIdInPath(
  path: string,
  workspaceId: string,
): string | null {
  const parsed = parseWorkspaceRoute(path);
  if (!parsed) {
    return null;
  }
  return workspacePath(workspaceId, parsed.kind);
}

export function buildNavLinks(workspaceId: string | null): NavLink[] {
  if (workspaceId === null) {
    return [
      { to: "/", label: "ダッシュボード" },
      { to: "/workspaces", label: "メンバー" },
    ];
  }

  return [
    { to: workspacePath(workspaceId, ""), label: "ダッシュボード" },
    { to: workspacePath(workspaceId, "tasks"), label: "タスク" },
    { to: workspacePath(workspaceId, "kanban"), label: "カンバン" },
    { to: workspacePath(workspaceId, "cases"), label: "案件" },
    { to: workspacePath(workspaceId, "calendar"), label: "カレンダー" },
    { to: workspacePath(workspaceId, "recurrence"), label: "繰り返し設定" },
    { to: workspacePath(workspaceId, "throughput"), label: "消化数" },
    { to: workspacePath(workspaceId, "holidays"), label: "休日マスタ" },
    { to: "/workspaces", label: "メンバー" },
  ];
}

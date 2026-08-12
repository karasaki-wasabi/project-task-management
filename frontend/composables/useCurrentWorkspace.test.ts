import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace, WorkspaceColor } from "./useApiClient";

const colorA = "color-a" as WorkspaceColor;
const colorB = "color-b" as WorkspaceColor;

const workspaces: Workspace[] = [
  {
    id: "ws-1",
    name: "Alpha",
    color: colorA,
    createdByUserId: "user-1",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  },
  {
    id: "ws-2",
    name: "Beta",
    color: colorB,
    createdByUserId: "user-1",
    createdAt: "2026-08-09T01:00:00.000Z",
    updatedAt: "2026-08-09T01:00:00.000Z",
  },
];

const state = new Map<string, { value: unknown }>();
const api = {
  listWorkspaces: vi.fn(),
};
const navigateTo = vi.fn();
const route = { path: "/", fullPath: "/", query: {} as Record<string, string> };
const localStorageMock = {
  store: new Map<string, string>(),
  getItem: vi.fn((key: string) => localStorageMock.store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    localStorageMock.store.delete(key);
  }),
};

beforeEach(() => {
  vi.resetModules();
  state.clear();
  localStorageMock.store.clear();
  api.listWorkspaces.mockReset();
  navigateTo.mockReset();
  route.path = "/";
  route.fullPath = "/";
  route.query = {};
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  vi.stubGlobal("useState", <T>(key: string, initializer: () => T) => {
    if (!state.has(key)) {
      state.set(key, { value: initializer() });
    }
    return state.get(key) as { value: T };
  });
  vi.stubGlobal("useApiClient", () => api);
  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal("navigateTo", navigateTo);
  vi.stubGlobal("useRoute", () => route);
});

describe("useCurrentWorkspace (task 1.2)", () => {
  it("所属一覧を取得し、localStorage の所属内 ID を現在選択として保持する", async () => {
    localStorageMock.store.set("currentWorkspaceId", "ws-2");
    api.listWorkspaces.mockResolvedValue(workspaces);
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");

    const current = useCurrentWorkspace();
    await current.refresh();

    expect(api.listWorkspaces).toHaveBeenCalledOnce();
    expect(current.workspaces.value).toEqual(workspaces);
    expect(current.currentId.value).toBe("ws-2");
  });

  it("所属があるが last-used が無いとき refresh 後も currentId は null のまま", async () => {
    api.listWorkspaces.mockResolvedValue(workspaces);
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");

    const current = useCurrentWorkspace();
    await current.refresh();

    expect(current.workspaces.value).toEqual(workspaces);
    expect(current.currentId.value).toBeNull();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it("所属があるが last-used が所属外のとき refresh 後も currentId は null のまま", async () => {
    localStorageMock.store.set("currentWorkspaceId", "not-a-member");
    api.listWorkspaces.mockResolvedValue(workspaces);
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");

    const current = useCurrentWorkspace();
    await current.refresh();

    expect(current.currentId.value).toBeNull();
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
      "currentWorkspaceId",
      "ws-1",
    );
  });

  it("所属が 0 件のとき currentId は null（空状態）になる", async () => {
    localStorageMock.store.set("currentWorkspaceId", "ws-1");
    api.listWorkspaces.mockResolvedValue([]);
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");

    const current = useCurrentWorkspace();
    await current.refresh();

    expect(current.workspaces.value).toEqual([]);
    expect(current.currentId.value).toBeNull();
  });

  it("select は所属一覧内の ID のみ受け付け、localStorage へ永続化する", async () => {
    api.listWorkspaces.mockResolvedValue(workspaces);
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");
    const current = useCurrentWorkspace();
    await current.refresh();

    current.select("ws-2");
    expect(current.currentId.value).toBe("ws-2");
    expect(localStorageMock.setItem).toHaveBeenCalledWith("currentWorkspaceId", "ws-2");

    current.select("outsider");
    expect(current.currentId.value).toBe("ws-2");
  });

  it("選択したワークスペース ID は再初期化後も保持される", async () => {
    api.listWorkspaces.mockResolvedValue(workspaces);
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");

    const first = useCurrentWorkspace();
    await first.refresh();
    first.select("ws-2");

    state.clear();
    vi.resetModules();
    vi.stubGlobal("useState", <T>(key: string, initializer: () => T) => {
      if (!state.has(key)) {
        state.set(key, { value: initializer() });
      }
      return state.get(key) as { value: T };
    });
    vi.stubGlobal("useApiClient", () => api);
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("navigateTo", navigateTo);
    vi.stubGlobal("useRoute", () => route);

    const { useCurrentWorkspace: useCurrentWorkspaceAgain } = await import("./useCurrentWorkspace");
    const second = useCurrentWorkspaceAgain();
    await second.refresh();

    expect(second.currentId.value).toBe("ws-2");
  });

  it("rememberLastUsed は localStorage に永続化する", async () => {
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");
    const current = useCurrentWorkspace();

    current.rememberLastUsed("ws-1");

    expect(localStorageMock.setItem).toHaveBeenCalledWith("currentWorkspaceId", "ws-1");
  });

  it("syncFromRoute は currentId を合わせ rememberLastUsed する", async () => {
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");
    const current = useCurrentWorkspace();

    current.syncFromRoute("ws-2");

    expect(current.currentId.value).toBe("ws-2");
    expect(localStorageMock.setItem).toHaveBeenCalledWith("currentWorkspaceId", "ws-2");
  });

  it("clearCurrent は選択と localStorage を解除する", async () => {
    api.listWorkspaces.mockResolvedValue(workspaces);
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");
    const current = useCurrentWorkspace();
    await current.refresh();
    current.select("ws-2");

    current.clearCurrent();

    expect(current.currentId.value).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("currentWorkspaceId");
  });

  it("clearCurrentIf は一致する ID のときだけ解除する", async () => {
    api.listWorkspaces.mockResolvedValue(workspaces);
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");
    const current = useCurrentWorkspace();
    await current.refresh();
    current.select("ws-2");
    localStorageMock.removeItem.mockClear();

    current.clearCurrentIf("ws-1");
    expect(current.currentId.value).toBe("ws-2");
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();

    current.clearCurrentIf("ws-2");
    expect(current.currentId.value).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("currentWorkspaceId");
  });

  it("relocateAfterWorkspaceLost は他所属があれば同一画面種へ遷移する", async () => {
    api.listWorkspaces.mockResolvedValue([workspaces[1]!]);
    route.path = "/workspaces/ws-1/tasks";
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");
    const current = useCurrentWorkspace();
    await current.refresh();
    current.syncFromRoute("ws-1");
    localStorageMock.setItem.mockClear();

    await current.relocateAfterWorkspaceLost("ws-1");

    expect(current.currentId.value).toBeNull();
    expect(navigateTo).toHaveBeenCalledWith("/workspaces/ws-2/tasks");
  });

  it("relocateAfterWorkspaceLost は画面種が特定できないとき他所属のダッシュボードへ遷移する", async () => {
    api.listWorkspaces.mockResolvedValue([workspaces[1]!]);
    route.path = "/workspaces";
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");
    const current = useCurrentWorkspace();
    await current.refresh();
    current.syncFromRoute("ws-1");

    await current.relocateAfterWorkspaceLost("ws-1");

    expect(navigateTo).toHaveBeenCalledWith("/workspaces/ws-2");
  });

  it("relocateAfterWorkspaceLost は他所属が無いとき / へ遷移する", async () => {
    api.listWorkspaces.mockResolvedValue([]);
    route.path = "/workspaces/ws-1/tasks";
    const { useCurrentWorkspace } = await import("./useCurrentWorkspace");
    const current = useCurrentWorkspace();
    await current.refresh();
    current.syncFromRoute("ws-1");

    await current.relocateAfterWorkspaceLost("ws-1");

    expect(current.currentId.value).toBeNull();
    expect(navigateTo).toHaveBeenCalledWith("/");
  });
});

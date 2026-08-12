import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const syncFromRoute = vi.fn();
const createError = vi.fn((payload: { statusCode: number }) =>
  Object.assign(new Error("NuxtError"), payload),
);
const workspaces = { value: [] as { id: string }[] };

beforeEach(() => {
  vi.resetModules();
  refresh.mockReset();
  syncFromRoute.mockReset();
  createError.mockClear();
  workspaces.value = [];
  vi.stubGlobal("defineNuxtRouteMiddleware", <T>(middleware: T) => middleware);
  vi.stubGlobal("createError", createError);
  vi.stubGlobal("useCurrentWorkspace", () => ({
    refresh,
    syncFromRoute,
    workspaces,
  }));
});

describe("workspace-member middleware", () => {
  it("非所属の workspaceId では 404 にし syncFromRoute しない", async () => {
    refresh.mockImplementation(async () => {
      workspaces.value = [{ id: "ws-a" }];
    });
    const { default: middleware } = await import("./workspace-member");

    await expect(
      middleware(
        {
          params: { workspaceId: "ws-unknown" },
          path: "/workspaces/ws-unknown/tasks",
        } as never,
        {} as never,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(refresh).toHaveBeenCalled();
    expect(createError).toHaveBeenCalledWith({ statusCode: 404 });
    expect(syncFromRoute).not.toHaveBeenCalled();
  });

  it("所属ゼロでも workspaceId 付き URL は 404 にする", async () => {
    refresh.mockImplementation(async () => {
      workspaces.value = [];
    });
    const { default: middleware } = await import("./workspace-member");

    await expect(
      middleware(
        {
          params: { workspaceId: "ws-any" },
          path: "/workspaces/ws-any",
        } as never,
        {} as never,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(createError).toHaveBeenCalledWith({ statusCode: 404 });
    expect(syncFromRoute).not.toHaveBeenCalled();
  });

  it("所属の workspaceId では syncFromRoute して通過する", async () => {
    refresh.mockImplementation(async () => {
      workspaces.value = [{ id: "ws-a" }, { id: "ws-b" }];
    });
    const { default: middleware } = await import("./workspace-member");

    await expect(
      middleware(
        {
          params: { workspaceId: "ws-b" },
          path: "/workspaces/ws-b/kanban",
        } as never,
        {} as never,
      ),
    ).resolves.toBeUndefined();

    expect(refresh).toHaveBeenCalled();
    expect(syncFromRoute).toHaveBeenCalledWith("ws-b");
    expect(createError).not.toHaveBeenCalled();
  });
});

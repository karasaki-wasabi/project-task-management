import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const navigateTo = vi.fn();

beforeEach(() => {
  vi.resetModules();
  refresh.mockReset();
  navigateTo.mockReset();
  vi.stubGlobal("defineNuxtRouteMiddleware", <T>(middleware: T) => middleware);
  vi.stubGlobal("navigateTo", navigateTo);
  vi.stubGlobal("useAuth", () => ({ refresh }));
});

describe("auth.global middleware (task 6.2)", () => {
  it("未ログインで業務 URL を開くと描画せずログインへリダイレクトする", async () => {
    refresh.mockRejectedValue(new Error("Unauthorized"));
    navigateTo.mockReturnValue("login-navigation");
    const { default: middleware } = await import("./auth.global");

    await expect(
      middleware(
        {
          path: "/workspaces/ws-1/tasks",
          fullPath: "/workspaces/ws-1/tasks?caseId=c1",
        } as never,
        {} as never,
      ),
    ).resolves.toBe("login-navigation");

    expect(navigateTo).toHaveBeenCalledWith({
      path: "/login",
      query: { redirect: "/workspaces/ws-1/tasks?caseId=c1" },
    });
  });

  it.each(["/login", "/register"])("未ログインでも公開パス %s を表示できる", async (path) => {
    refresh.mockRejectedValue(new Error("Unauthorized"));
    const { default: middleware } = await import("./auth.global");

    await expect(middleware({ path, fullPath: path } as never, {} as never)).resolves.toBeUndefined();

    expect(navigateTo).not.toHaveBeenCalled();
  });

  it.each(["/login", "/register"])("ログイン済みで公開パス %s を開くとトップへリダイレクトする", async (path) => {
    refresh.mockResolvedValue({ id: "user-1" });
    navigateTo.mockReturnValue("home-navigation");
    const { default: middleware } = await import("./auth.global");

    await expect(middleware({ path, fullPath: path } as never, {} as never)).resolves.toBe("home-navigation");

    expect(navigateTo).toHaveBeenCalledWith("/");
  });

  it("ログイン済みなら業務 URL を表示できる", async () => {
    refresh.mockResolvedValue({ id: "user-1" });
    const { default: middleware } = await import("./auth.global");

    await expect(
      middleware(
        { path: "/workspaces/ws-1/tasks", fullPath: "/workspaces/ws-1/tasks" } as never,
        {} as never,
      ),
    ).resolves.toBeUndefined();

    expect(navigateTo).not.toHaveBeenCalled();
  });
});

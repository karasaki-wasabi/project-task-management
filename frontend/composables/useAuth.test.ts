import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "./useApiClient";

const user: PublicUser = {
  id: "user-1",
  email: "member@example.com",
  name: "利用者",
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

const state = new Map<string, { value: unknown }>();
const api = {
  me: vi.fn(),
  logout: vi.fn(),
};

beforeEach(() => {
  vi.resetModules();
  state.clear();
  api.me.mockReset();
  api.logout.mockReset();
  vi.stubGlobal("useState", <T>(key: string, initializer: () => T) => {
    if (!state.has(key)) {
      state.set(key, { value: initializer() });
    }
    return state.get(key) as { value: T };
  });
  vi.stubGlobal("useApiClient", () => api);
});

describe("useAuth (task 6.2)", () => {
  it("me の成功結果を共有するログインユーザー状態に保持する", async () => {
    api.me.mockResolvedValue(user);
    const { useAuth } = await import("./useAuth");

    const auth = useAuth();
    await expect(auth.refresh()).resolves.toEqual(user);

    expect(api.me).toHaveBeenCalledOnce();
    expect(auth.user.value).toEqual(user);
  });

  it("me が失敗した場合はユーザー状態をクリアし、失敗を呼び出し元へ伝える", async () => {
    const error = new Error("Unauthorized");
    api.me.mockResolvedValueOnce(user).mockRejectedValueOnce(error);
    const { useAuth } = await import("./useAuth");
    const auth = useAuth();
    await auth.refresh();

    await expect(auth.refresh()).rejects.toThrow("Unauthorized");
    expect(auth.user.value).toBeNull();
  });

  it("ログアウト後にユーザー状態をクリアする", async () => {
    api.me.mockResolvedValue(user);
    api.logout.mockResolvedValue(undefined);
    const { useAuth } = await import("./useAuth");
    const auth = useAuth();
    await auth.refresh();

    await auth.logout();

    expect(api.logout).toHaveBeenCalledOnce();
    expect(auth.user.value).toBeNull();
  });
});

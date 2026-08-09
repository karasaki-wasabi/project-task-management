import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import App from "./app.vue";

const ErrorAlertStub = {
  props: ["message"],
  template: '<p role="alert">{{ message }}</p>',
};
const route = reactive({ path: "/", meta: {} as Record<string, unknown> });
const logout = vi.fn();
const navigateTo = vi.fn();
const auth = {
  user: ref<{ name: string } | null>(null),
  logout,
};

beforeEach(() => {
  route.path = "/";
  route.meta = {};
  logout.mockReset();
  navigateTo.mockReset();
  auth.user.value = null;
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useAuth", () => auth);
  vi.stubGlobal("navigateTo", navigateTo);
});

describe("App shell (task 6.4)", () => {
  it.each(["/login", "/register"])("認証画面 %s では業務ナビを表示しない", (path) => {
    route.path = path;
    const wrapper = mount(App, {
      global: {
        stubs: {
          NuxtPage: { template: "<div>認証フォーム</div>" },
          NuxtLink: { template: "<a><slot /></a>" },
          ErrorAlert: ErrorAlertStub,
        },
      },
    });

    expect(wrapper.find("header").exists()).toBe(false);
    expect(wrapper.get("main").classes()).toContain("p-0");
  });

  it("ログイン中の表示名を表示し、ログアウト後はログイン画面へ移動する", async () => {
    auth.user.value = {
      name: "山田 太郎",
    };
    logout.mockResolvedValue(undefined);

    const wrapper = mount(App, {
      global: {
        stubs: {
          NuxtPage: { template: "<div>業務画面</div>" },
          NuxtLink: { template: "<a><slot /></a>" },
          ErrorAlert: ErrorAlertStub,
        },
      },
    });

    expect(wrapper.text()).toContain("山田 太郎");
    const logoutButton = wrapper.get("button");
    expect(logoutButton.text()).toBe("ログアウト");

    await logoutButton.trigger("click");

    expect(logout).toHaveBeenCalledOnce();
    expect(navigateTo).toHaveBeenCalledWith("/login");
  });

  it("ログアウトに失敗するとエラーを表示し、現在の画面にとどまる", async () => {
    const error = new Error("ログアウトに失敗しました");
    logout.mockRejectedValue(error);

    const wrapper = mount(App, {
      global: {
        stubs: {
          NuxtPage: { template: "<div>業務画面</div>" },
          NuxtLink: { template: "<a><slot /></a>" },
          ErrorAlert: ErrorAlertStub,
        },
      },
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.get('[role="alert"]').text()).toBe("ログアウトに失敗しました");
    expect(navigateTo).not.toHaveBeenCalled();
  });
});

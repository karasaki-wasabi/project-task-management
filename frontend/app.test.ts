import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import App from "./app.vue";

const route = reactive({ path: "/", meta: {} as Record<string, unknown> });

beforeEach(() => {
  route.path = "/";
  route.meta = {};
  vi.stubGlobal("useRoute", () => route);
});

describe("App shell (task 6.3)", () => {
  it.each(["/login", "/register"])("認証画面 %s では業務ナビを表示しない", (path) => {
    route.path = path;
    const wrapper = mount(App, {
      global: {
        stubs: {
          NuxtPage: { template: "<div>認証フォーム</div>" },
          NuxtLink: { template: "<a><slot /></a>" },
        },
      },
    });

    expect(wrapper.find("header").exists()).toBe(false);
    expect(wrapper.get("main").classes()).toContain("p-0");
  });
});

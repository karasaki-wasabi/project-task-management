import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import App from "./app.vue";
import UserAvatar from "./components/shared/UserAvatar.vue";

const ErrorAlertStub = {
  props: ["message"],
  template: '<p role="alert">{{ message }}</p>',
};
const WorkspaceSwitcherStub = {
  name: "WorkspaceSwitcher",
  template: '<div data-testid="workspace-switcher-stub">切替</div>',
};
const route = reactive({ path: "/", meta: {} as Record<string, unknown> });
const logout = vi.fn();
const navigateTo = vi.fn();
const currentId = ref<string | null>(null);
const auth = {
  user: ref<{ id: string; name: string } | null>(null),
  logout,
};

vi.mock("./composables/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    currentId,
    workspaces: ref([]),
    refresh: vi.fn(),
    select: vi.fn(),
  }),
}));

function mountApp(stubs: Record<string, unknown> = {}) {
  return mount(App, {
    global: {
      components: { UserAvatar },
      stubs: {
        NuxtPage: { template: "<div>業務画面</div>" },
        NuxtLink: { template: "<a><slot /></a>" },
        ErrorAlert: ErrorAlertStub,
        WorkspaceSwitcher: WorkspaceSwitcherStub,
        ...stubs,
      },
    },
  });
}

function logoutButton(wrapper: ReturnType<typeof mountApp>) {
  const button = wrapper.findAll("button").find((b) => b.text().trim() === "ログアウト");
  if (!button) throw new Error("ログアウト button not found");
  return button;
}

beforeEach(() => {
  route.path = "/";
  route.meta = {};
  logout.mockReset();
  navigateTo.mockReset();
  auth.user.value = null;
  currentId.value = null;
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useAuth", () => auth);
  vi.stubGlobal("navigateTo", navigateTo);
});

describe("App shell (task 6.4 / 6.2)", () => {
  it.each(["/login", "/register"])("認証画面 %s では業務ナビを表示しない", (path) => {
    route.path = path;
    const wrapper = mountApp({
      NuxtPage: { template: "<div>認証フォーム</div>" },
    });

    expect(wrapper.find("header").exists()).toBe(false);
    expect(wrapper.get("main").classes()).toContain("p-0");
  });

  it("ログイン中の表示名を表示し、ログアウト後はログイン画面へ移動する", async () => {
    auth.user.value = {
      id: "user-1",
      name: "山田 太郎",
    };
    logout.mockResolvedValue(undefined);

    const wrapper = mountApp();

    expect(wrapper.text()).toContain("山田 太郎");
    const button = logoutButton(wrapper);
    expect(button.text()).toBe("ログアウト");

    await button.trigger("click");

    expect(logout).toHaveBeenCalledOnce();
    expect(navigateTo).toHaveBeenCalledWith("/login");
  });

  it("ヘッダーの現在ユーザー表示に UserAvatar（28px）を併記する（user-avatar 3.6 / Req 2.1）", () => {
    auth.user.value = {
      id: "user-1",
      name: "山田 太郎",
    };

    const wrapper = mountApp();
    const avatar = wrapper.getComponent(UserAvatar);

    expect(avatar.props("userId")).toBe("user-1");
    expect(avatar.props("size")).toBe(28);
    expect(avatar.props("name")).toBeUndefined();
    expect(wrapper.text()).toContain("山田 太郎");

    const row = avatar.element.parentElement;
    expect(row).not.toBeNull();
    expect(row!.className).toMatch(/flex/);
    expect(row!.textContent).toContain("山田 太郎");
  });

  it("ユーザー未ログイン時はヘッダーに UserAvatar を出さない", () => {
    auth.user.value = null;
    const wrapper = mountApp();

    expect(wrapper.findComponent(UserAvatar).exists()).toBe(false);
  });

  it("ログアウトに失敗するとエラーを表示し、現在の画面にとどまる", async () => {
    const error = new Error("ログアウトに失敗しました");
    logout.mockRejectedValue(error);

    const wrapper = mountApp();

    await logoutButton(wrapper).trigger("click");

    expect(wrapper.get('[role="alert"]').text()).toBe("ログアウトに失敗しました");
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("ヘッダー右クラスタに WorkspaceSwitcher を置き、ナビと表示名の間に配置する（task 6.2 案B）", () => {
    auth.user.value = { id: "user-1", name: "山田 太郎" };
    const wrapper = mountApp();

    const header = wrapper.get("header");
    expect(header.find('[data-testid="workspace-switcher-stub"]').exists()).toBe(true);

    const rightCluster = header.get(".ml-auto");
    const html = rightCluster.html();
    const switcherIdx = html.indexOf("workspace-switcher-stub");
    const nameIdx = html.indexOf("山田 太郎");
    expect(switcherIdx).toBeGreaterThan(-1);
    expect(nameIdx).toBeGreaterThan(-1);
    expect(switcherIdx).toBeLessThan(nameIdx);
  });

  it("currentId があるとき業務ナビは同一 workspaceId の scoped path になる（workspace-url-routing 4.1）", () => {
    currentId.value = "ws-1";
    auth.user.value = { id: "user-1", name: "山田 太郎" };
    const wrapper = mountApp({
      NuxtLink: {
        props: ["to"],
        template: '<a :href="typeof to === \'string\' ? to : \'#\'"><slot /></a>',
      },
    });

    const hrefs = wrapper
      .findAll("nav a")
      .map((a) => a.attributes("href"))
      .filter((href): href is string => Boolean(href));
    expect(hrefs).toContain("/workspaces/ws-1/tasks");
    expect(hrefs).toContain("/workspaces/ws-1/kanban");
    expect(hrefs).toContain("/workspaces");
    expect(hrefs).not.toContain("/tasks");
  });

  it("currentId が null のときナビは / と /workspaces のみ（workspace-url-routing 4.1）", () => {
    currentId.value = null;
    auth.user.value = { id: "user-1", name: "山田 太郎" };
    const wrapper = mountApp({
      NuxtLink: {
        props: ["to"],
        template: '<a :href="typeof to === \'string\' ? to : \'#\'"><slot /></a>',
      },
    });

    const hrefs = wrapper
      .findAll("nav a")
      .map((a) => a.attributes("href"))
      .filter((href): href is string => Boolean(href));
    expect(hrefs).toEqual(["/", "/workspaces"]);
  });
});

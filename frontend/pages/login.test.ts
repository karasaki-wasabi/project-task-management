import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import LoginPage from "./login.vue";

const login = vi.fn();
const authUser = ref(null);
const navigateTo = vi.fn();
const route = { query: {} as Record<string, string | undefined> };

vi.mock("../composables/useApiClient", () => ({
  useApiClient: () => ({ login }),
}));

vi.mock("../composables/useAuth", () => ({
  useAuth: () => ({ user: authUser }),
}));

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<p role="alert">{{ message }}</p>`,
});

function mountPage() {
  return mount(LoginPage, {
    global: {
      stubs: { ErrorAlert: ErrorAlertStub, NuxtLink: { template: "<a><slot /></a>" } },
    },
  });
}

describe("LoginPage (task 6.3)", () => {
  beforeEach(() => {
    login.mockReset();
    navigateTo.mockReset();
    authUser.value = null;
    route.query = {};
    vi.stubGlobal("useRoute", () => route);
    vi.stubGlobal("navigateTo", navigateTo);
  });

  it("ログイン成功時は認証状態を保存し、redirect 先へ遷移する", async () => {
    const user = { id: "user-1", name: "利用者", email: "member@example.com" };
    login.mockResolvedValue(user);
    route.query = { redirect: "/tasks?view=mine" };
    const wrapper = mountPage();

    await wrapper.get("#email").setValue("member@example.com");
    await wrapper.get("#password").setValue("correct-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(login).toHaveBeenCalledWith({
      email: "member@example.com",
      password: "correct-password",
    });
    expect(authUser.value).toEqual(user);
    expect(navigateTo).toHaveBeenCalledWith("/tasks?view=mine");
  });

  it("ログイン失敗時は固定文言をフォーム上部に表示する", async () => {
    login.mockRejectedValue(new Error("メールアドレスまたはパスワードが正しくありません。"));
    const wrapper = mountPage();

    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("メールアドレスまたはパスワードが正しくありません。");
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("パスワード表示を切り替えられる", async () => {
    const wrapper = mountPage();
    const password = wrapper.get("#password");

    expect(password.attributes("type")).toBe("password");
    await wrapper.get('button[aria-label="パスワードを表示"]').trigger("click");
    expect(password.attributes("type")).toBe("text");
    expect(wrapper.find('button[aria-label="パスワードを非表示"]').exists()).toBe(true);
  });
});

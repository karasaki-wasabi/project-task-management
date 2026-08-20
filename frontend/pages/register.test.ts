import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { defineComponent, ref } from "vue";
import RegisterPage from "./register.vue";

const register = vi.fn();
const authUser = ref(null);
const navigateTo = vi.hoisted(() => vi.fn());

vi.mock("../composables/useApiClient", () => ({
  useApiClient: () => ({ register }),
}));

vi.mock("../composables/useAuth", () => ({
  useAuth: () => ({ user: authUser }),
}));

mockNuxtImport("navigateTo", () => navigateTo);

const ErrorAlertStub = defineComponent({
  name: "ErrorAlert",
  props: { message: { type: String, required: true } },
  template: `<p role="alert">{{ message }}</p>`,
});

function mountPage() {
  return mount(RegisterPage, {
    global: {
      stubs: { ErrorAlert: ErrorAlertStub, NuxtLink: { template: "<a><slot /></a>" } },
    },
  });
}

describe("RegisterPage (task 6.3)", () => {
  beforeEach(() => {
    register.mockReset();
    navigateTo.mockReset();
    authUser.value = null;
  });

  it("登録成功時は自動ログイン状態を保存してダッシュボードへ遷移する", async () => {
    const user = { id: "user-1", name: "利用者", email: "member@example.com" };
    register.mockResolvedValue(user);
    const wrapper = mountPage();

    await wrapper.get("#email").setValue("member@example.com");
    await wrapper.get("#name").setValue("利用者");
    await wrapper.get("#password").setValue("correct-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(register).toHaveBeenCalledWith({
      email: "member@example.com",
      name: "利用者",
      password: "correct-password",
    });
    expect(authUser.value).toEqual(user);
    expect(navigateTo).toHaveBeenCalledWith("/");
  });

  it("登録失敗時はフォーム上部にエラーを表示する", async () => {
    register.mockRejectedValue(new Error("このメールアドレスはすでに登録されています。"));
    const wrapper = mountPage();

    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("このメールアドレスはすでに登録されています。");
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("パスワード表示を切り替えられる", async () => {
    const wrapper = mountPage();
    const password = wrapper.get("#password");

    expect(password.attributes("type")).toBe("password");
    await wrapper.get('button[aria-label="パスワードを表示"]').trigger("click");
    expect(password.attributes("type")).toBe("text");
  });
});

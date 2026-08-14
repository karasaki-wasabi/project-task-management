import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ErrorPage from "./error.vue";

const clearError = vi.fn();
const route = { fullPath: "/workspaces/ws-1/tasks/t-1" };

const CASES = [
  {
    statusCode: 404,
    code: "404",
    title: "お探しのページが見つかりません",
    message:
      "URLが変更されたか、削除された可能性があります。ホームから操作をやり直してください。",
    showLogin: false,
  },
  {
    statusCode: 403,
    code: "403",
    title: "このページへのアクセス権限がありません",
    message:
      "閲覧に必要な権限が付与されていません。心当たりがない場合は、ログイン中のアカウントとワークスペースをご確認ください。",
    showLogin: false,
  },
  {
    statusCode: 401,
    code: "401",
    title: "ログインが必要です",
    message: "セッションの有効期限が切れた可能性があります。再度ログインしてください。",
    showLogin: true,
  },
  {
    statusCode: 500,
    code: "500",
    title: "予期せぬエラーが発生しました",
    message: "時間をおいて再度お試しください。",
    showLogin: false,
  },
  {
    statusCode: 409,
    code: "409",
    title: "エラーが発生しました",
    message: "リクエストを処理できませんでした。操作をやり直してください。",
    showLogin: false,
  },
  {
    statusCode: 503,
    code: "503",
    title: "エラーが発生しました",
    message: "サーバー側で問題が発生しています。時間をおいて再度お試しください。",
    showLogin: false,
  },
] as const;

function mountError(statusCode: number) {
  return mount(ErrorPage, {
    props: { error: { statusCode } },
  });
}

function buttonByLabel(wrapper: ReturnType<typeof mountError>, label: string) {
  return wrapper.findAll("button").find((button) => button.text() === label);
}

describe("error.vue", () => {
  beforeEach(() => {
    clearError.mockReset();
    route.fullPath = "/workspaces/ws-1/tasks/t-1";
    vi.stubGlobal("clearError", clearError);
    vi.stubGlobal("useRoute", () => route);
  });

  it.each(CASES)(
    "statusCode $statusCode は対応する見出し・本文・ボタン構成を同一レイアウトで描画する",
    ({ statusCode, code, title, message, showLogin }) => {
      const wrapper = mountError(statusCode);

      expect(wrapper.find("svg").exists()).toBe(true);
      expect(wrapper.get("[data-error-code]").text()).toBe(code);
      expect(wrapper.get("h1").text()).toBe(title);
      expect(wrapper.get("p").text()).toBe(message);
      expect(buttonByLabel(wrapper, "ホームへ戻る")).toBeDefined();
      expect(wrapper.findAll("button")).toHaveLength(showLogin ? 2 : 1);
      expect(wrapper.findAll("button").some((button) => button.text() === "ログイン画面へ")).toBe(
        showLogin,
      );
    },
  );

  it("ホームへ戻る操作はエラー状態を解除してトップページへ遷移する", async () => {
    const wrapper = mountError(404);
    const home = buttonByLabel(wrapper, "ホームへ戻る");

    expect(home).toBeDefined();
    await home!.trigger("click");

    expect(clearError).toHaveBeenCalledWith({ redirect: "/" });
  });

  it("401のログイン画面へ操作は現在URLへの復帰情報付きでエラー状態を解除する", async () => {
    route.fullPath = "/workspaces/ws-1/tasks/t-1?tab=comments";
    const wrapper = mountError(401);
    const login = buttonByLabel(wrapper, "ログイン画面へ");

    expect(login).toBeDefined();
    await login!.trigger("click");

    expect(clearError).toHaveBeenCalledWith({
      redirect: `/login?redirect=${encodeURIComponent("/workspaces/ws-1/tasks/t-1?tab=comments")}`,
    });
  });
});

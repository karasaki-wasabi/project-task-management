import { describe, expect, it } from "vitest";
import { getErrorPageContent } from "./useErrorPageContent";

const CONTENT_500 = {
  icon: "serverError",
  code: "500",
  title: "予期せぬエラーが発生しました",
  message: "時間をおいて再度お試しください。",
  showLoginAction: false,
} as const;

describe("getErrorPageContent", () => {
  it("404 は専用のアイコン・見出し・本文を返し、ログイン導線は出さない", () => {
    expect(getErrorPageContent(404)).toEqual({
      icon: "notFound",
      code: "404",
      title: "お探しのページが見つかりません",
      message:
        "URLが変更されたか、削除された可能性があります。ホームから操作をやり直してください。",
      showLoginAction: false,
    });
  });

  it("403 は専用のアイコン・見出し・本文を返し、ログイン導線は出さない", () => {
    expect(getErrorPageContent(403)).toEqual({
      icon: "forbidden",
      code: "403",
      title: "このページへのアクセス権限がありません",
      message:
        "閲覧に必要な権限が付与されていません。心当たりがない場合は、ログイン中のアカウントとワークスペースをご確認ください。",
      showLoginAction: false,
    });
  });

  it("401 は専用のアイコン・見出し・本文を返し、ログイン導線を出す", () => {
    expect(getErrorPageContent(401)).toEqual({
      icon: "unauthorized",
      code: "401",
      title: "ログインが必要です",
      message: "セッションの有効期限が切れた可能性があります。再度ログインしてください。",
      showLoginAction: true,
    });
  });

  it("500 は専用のアイコン・見出し・本文を返し、ログイン導線は出さない", () => {
    expect(getErrorPageContent(500)).toEqual(CONTENT_500);
  });

  it.each([400, 409])(
    "専用4値以外の4xx(%s)は汎用4xxのアイコン・見出し・本文と受け取ったコードを返す",
    (statusCode) => {
      expect(getErrorPageContent(statusCode)).toEqual({
        icon: "clientErrorGeneric",
        code: String(statusCode),
        title: "エラーが発生しました",
        message: "リクエストを処理できませんでした。操作をやり直してください。",
        showLoginAction: false,
      });
    },
  );

  it.each([502, 503])(
    "500以外の5xx(%s)は汎用5xxのアイコン・見出し・本文と受け取ったコードを返す",
    (statusCode) => {
      expect(getErrorPageContent(statusCode)).toEqual({
        icon: "serverErrorGeneric",
        code: String(statusCode),
        title: "エラーが発生しました",
        message: "サーバー側で問題が発生しています。時間をおいて再度お試しください。",
        showLoginAction: false,
      });
    },
  );

  it.each([
    { label: "未定義", statusCode: undefined },
    { label: "400未満", statusCode: 399 },
    { label: "600以上", statusCode: 600 },
  ])("statusCodeが$labelのときは500と同一の内容を返す", ({ statusCode }) => {
    expect(getErrorPageContent(statusCode)).toEqual(CONTENT_500);
  });
});

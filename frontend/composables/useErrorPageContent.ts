export type ErrorPageIcon =
  | "notFound"
  | "forbidden"
  | "unauthorized"
  | "serverError"
  | "clientErrorGeneric"
  | "serverErrorGeneric";

export interface ErrorPageContent {
  icon: ErrorPageIcon;
  code: string;
  title: string;
  message: string;
  showLoginAction: boolean;
}

const CONTENT_500: ErrorPageContent = {
  icon: "serverError",
  code: "500",
  title: "予期せぬエラーが発生しました",
  message: "時間をおいて再度お試しください。",
  showLoginAction: false,
};

const DEDICATED: Record<404 | 403 | 401 | 500, ErrorPageContent> = {
  404: {
    icon: "notFound",
    code: "404",
    title: "お探しのページが見つかりません",
    message:
      "URLが変更されたか、削除された可能性があります。ホームから操作をやり直してください。",
    showLoginAction: false,
  },
  403: {
    icon: "forbidden",
    code: "403",
    title: "このページへのアクセス権限がありません",
    message:
      "閲覧に必要な権限が付与されていません。心当たりがない場合は、ログイン中のアカウントとワークスペースをご確認ください。",
    showLoginAction: false,
  },
  401: {
    icon: "unauthorized",
    code: "401",
    title: "ログインが必要です",
    message: "セッションの有効期限が切れた可能性があります。再度ログインしてください。",
    showLoginAction: true,
  },
  500: CONTENT_500,
};

export function getErrorPageContent(statusCode: number | undefined): ErrorPageContent {
  if (statusCode === 404 || statusCode === 403 || statusCode === 401 || statusCode === 500) {
    return DEDICATED[statusCode];
  }

  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return {
      icon: "clientErrorGeneric",
      code: String(statusCode),
      title: "エラーが発生しました",
      message: "リクエストを処理できませんでした。操作をやり直してください。",
      showLoginAction: false,
    };
  }

  if (statusCode !== undefined && statusCode >= 500 && statusCode < 600) {
    return {
      icon: "serverErrorGeneric",
      code: String(statusCode),
      title: "エラーが発生しました",
      message: "サーバー側で問題が発生しています。時間をおいて再度お試しください。",
      showLoginAction: false,
    };
  }

  return CONTENT_500;
}

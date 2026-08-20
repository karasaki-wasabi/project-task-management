type ErrorReporterNuxtApp = {
  runWithContext: (fn: () => void) => void;
};

export function createErrorReporter(nuxtApp: ErrorReporterNuxtApp) {
  const config = useRuntimeConfig();

  const RATE_LIMIT_WINDOW_MS = 10_000;
  const shouldReport = createErrorReportRateLimiter(RATE_LIMIT_WINDOW_MS);

  function report(message: string, stack?: string): void {
    try {
      if (!shouldReport(message)) return;
      $fetch(`${config.public.apiBaseUrl.replace(/\/+$/, "")}/api/client-errors`, {
        method: "POST",
        body: {
          message,
          stack,
          pageUrl: window.location.href,
          occurredAt: new Date().toISOString(),
        },
      }).catch(() => {});
    } catch {
      // レポート失敗はエラーページ表示をブロックしない
    }
  }

  function triggerErrorPage(error: Error): void {
    try {
      nuxtApp.runWithContext(() => showError(error));
    } catch {
      // 表示失敗はレポートをブロックしない
    }
  }

  function handleVueError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    report(err.message, err.stack);
    triggerErrorPage(err);
  }

  function handleWindowError(event: ErrorEvent): void {
    report(event.message, event.error?.stack);
    if (event.error instanceof Error) {
      triggerErrorPage(event.error);
    }
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent): void {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    report(reason.message, reason.stack);
    if (event.reason instanceof Error) {
      triggerErrorPage(event.reason);
    }
  }

  return {
    report,
    triggerErrorPage,
    handleVueError,
    handleWindowError,
    handleUnhandledRejection,
  };
}

export default defineNuxtPlugin((nuxtApp) => {
  const { handleVueError, handleWindowError, handleUnhandledRejection } = createErrorReporter(nuxtApp);

  nuxtApp.vueApp.config.errorHandler = handleVueError;
  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
});

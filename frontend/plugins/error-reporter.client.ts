// Frontend error reporting plugin (task 11.7, design.md
// "Frontend/plugins/error-reporter.client プラグイン", Requirement 10.4).
// Subscribes to Vue's global error handler and window.onerror, and POSTs
// uncaught errors to the backend's ClientErrorsService. `.client.ts` suffix
// (Nuxt convention) ensures this only runs in the browser, matching
// `ssr: false`.
//
// Task 2.2 additionally triggers the Error Page (`showError`) independently
// of reporting. Window listeners may run outside Nuxt context, so display
// goes through `nuxtApp.runWithContext`.
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
        // A broken error-reporting call must never itself throw and loop.
      }).catch(() => {});
    } catch {
      // Reporting failure must not block error page display.
    }
  }

  function triggerErrorPage(error: Error): void {
    try {
      nuxtApp.runWithContext(() => showError(error));
    } catch {
      // Display failure must not block reporting.
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

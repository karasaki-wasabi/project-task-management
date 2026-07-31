// Frontend error reporting plugin (task 11.7, design.md
// "Frontend/plugins/error-reporter.client プラグイン", Requirement 10.4).
// Subscribes to Vue's global error handler and window.onerror, and POSTs
// uncaught errors to the backend's ClientErrorsService. `.client.ts` suffix
// (Nuxt convention) ensures this only runs in the browser, matching
// `ssr: false`.
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();

  const RATE_LIMIT_WINDOW_MS = 10_000;
  const shouldReport = createErrorReportRateLimiter(RATE_LIMIT_WINDOW_MS);

  function report(message: string, stack?: string): void {
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
  }

  nuxtApp.vueApp.config.errorHandler = (error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    report(err.message, err.stack);
  };

  window.addEventListener("error", (event) => {
    report(event.message, event.error?.stack);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    report(reason.message, reason.stack);
  });
});

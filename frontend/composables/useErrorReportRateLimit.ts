// Simple "same message, not too often" rate limiter for the error-reporter
// plugin (task 11.7, design.md Implementation Notes: "同一エラーの連続送信
// を抑制する簡易レート制限"). Extracted as a plain function (not tied to
// the Nuxt plugin lifecycle) so it has direct unit test coverage.
export function createErrorReportRateLimiter(windowMs: number, now: () => number = Date.now) {
  const lastReportedAt = new Map<string, number>();

  return function shouldReport(message: string): boolean {
    const current = now();
    const previous = lastReportedAt.get(message);
    if (previous !== undefined && current - previous < windowMs) {
      return false;
    }
    lastReportedAt.set(message, current);
    return true;
  };
}

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

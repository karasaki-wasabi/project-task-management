import { describe, expect, it } from "vitest";
import { createErrorReportRateLimiter } from "./useErrorReportRateLimit";

describe("createErrorReportRateLimiter (task 11.7)", () => {
  it("allows the first report of a given message", () => {
    const shouldReport = createErrorReportRateLimiter(10_000, () => 0);
    expect(shouldReport("boom")).toBe(true);
  });

  it("suppresses a repeat of the same message within the window", () => {
    let now = 0;
    const shouldReport = createErrorReportRateLimiter(10_000, () => now);

    expect(shouldReport("boom")).toBe(true);
    now = 5_000;
    expect(shouldReport("boom")).toBe(false);
  });

  it("allows the same message again once the window has elapsed", () => {
    let now = 0;
    const shouldReport = createErrorReportRateLimiter(10_000, () => now);

    expect(shouldReport("boom")).toBe(true);
    now = 10_001;
    expect(shouldReport("boom")).toBe(true);
  });

  it("does not rate-limit distinct messages against each other", () => {
    const shouldReport = createErrorReportRateLimiter(10_000, () => 0);

    expect(shouldReport("boom")).toBe(true);
    expect(shouldReport("crash")).toBe(true);
  });
});

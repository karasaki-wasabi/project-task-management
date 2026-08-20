import { describe, expect, it } from "vitest";
import { createErrorReportRateLimiter } from "./useErrorReportRateLimit";

describe("createErrorReportRateLimiter (task 11.7)", () => {
  it("allows the first report of a given message", () => {
    const shouldReport = createErrorReportRateLimiter(10_000, () => 0);
    expect(shouldReport("boom")).toBe(true);
  });

  it("同じメッセージがウィンドウ内で繰り返される場合、抑制", () => {
    let now = 0;
    const shouldReport = createErrorReportRateLimiter(10_000, () => now);

    expect(shouldReport("boom")).toBe(true);
    now = 5_000;
    expect(shouldReport("boom")).toBe(false);
  });

  it("ウィンドウが経過した後、同じメッセージを再度許可", () => {
    let now = 0;
    const shouldReport = createErrorReportRateLimiter(10_000, () => now);

    expect(shouldReport("boom")).toBe(true);
    now = 10_001;
    expect(shouldReport("boom")).toBe(true);
  });

  it("異なるメッセージは互いにレート制限されない", () => {
    const shouldReport = createErrorReportRateLimiter(10_000, () => 0);

    expect(shouldReport("boom")).toBe(true);
    expect(shouldReport("crash")).toBe(true);
  });
});

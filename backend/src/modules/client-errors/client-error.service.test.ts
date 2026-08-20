import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../shared/logger.js";
import { createClientErrorsService } from "./client-error.service.js";

function collectingStream() {
  const lines: Record<string, unknown>[] = [];
  let buffer = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          lines.push(JSON.parse(line));
        }
      }
      callback();
    },
  });
  return { stream, lines };
}

describe("clientErrorsService (task 8.1)", () => {
  it("レポートを Logging Infrastructure でログし、サーバーサイドエラーと同じ形状になる (Requirement 10.4)", async () => {
    const { stream, lines } = collectingStream();
    const logger = createLogger("debug", stream);
    const service = createClientErrorsService(logger);

    await service.report(
      {
        message: "TypeError: cannot read property 'x' of undefined",
        stack: "TypeError: ...\n  at App.vue:12:3",
        pageUrl: "https://app.example.com/tasks",
        occurredAt: "2026-08-01T09:00:00.000Z",
      },
      "req-42",
    );

    expect(lines).toHaveLength(1);
    const entry = lines[0];
    expect(entry.requestId).toBe("req-42");
    expect(entry.pageUrl).toBe("https://app.example.com/tasks");
    expect(entry.occurredAt).toBe("2026-08-01T09:00:00.000Z");
    const err = entry.err as Record<string, unknown>;
    expect(err.message).toBe("TypeError: cannot read property 'x' of undefined");
    expect(err.stack).toContain("App.vue:12:3");
  });

  it("異常に長いスタックトレースを切り詰めてログに残す代わりに、完全なスタックトレースをログに残さない", async () => {
    const { stream, lines } = collectingStream();
    const logger = createLogger("debug", stream);
    const service = createClientErrorsService(logger);
    const hugeStack = "x".repeat(50_000);

    await service.report(
      { message: "boom", stack: hugeStack, pageUrl: "https://app.example.com/", occurredAt: "2026-08-01T09:00:00.000Z" },
      "req-1",
    );

    const err = lines[0].err as Record<string, unknown>;
    expect((err.stack as string).length).toBeLessThan(hugeStack.length);
  });

  it("空の message を受け取った場合、400 エラーを返す", async () => {
    const logger = createLogger("debug", collectingStream().stream);
    const service = createClientErrorsService(logger);

    await expect(
      service.report({ message: "  ", pageUrl: "https://app.example.com/", occurredAt: "2026-08-01T09:00:00.000Z" }, "req-1"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("空の pageUrl を受け取った場合、400 エラーを返す", async () => {
    const logger = createLogger("debug", collectingStream().stream);
    const service = createClientErrorsService(logger);

    await expect(
      service.report({ message: "boom", pageUrl: "  ", occurredAt: "2026-08-01T09:00:00.000Z" }, "req-1"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

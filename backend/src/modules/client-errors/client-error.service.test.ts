// RED: clientErrorsService / createClientErrorsService do not exist yet
// (task 8.1, Requirements 10.4).
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
  it("logs the report via Logging Infrastructure in the same shape as a server-side error (Requirement 10.4)", async () => {
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

  it("truncates an abnormally long stack trace instead of logging it in full", async () => {
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

  it("rejects an empty message with a 400-shaped error", async () => {
    const logger = createLogger("debug", collectingStream().stream);
    const service = createClientErrorsService(logger);

    await expect(
      service.report({ message: "  ", pageUrl: "https://app.example.com/", occurredAt: "2026-08-01T09:00:00.000Z" }, "req-1"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects an empty pageUrl with a 400-shaped error", async () => {
    const logger = createLogger("debug", collectingStream().stream);
    const service = createClientErrorsService(logger);

    await expect(
      service.report({ message: "boom", pageUrl: "  ", occurredAt: "2026-08-01T09:00:00.000Z" }, "req-1"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

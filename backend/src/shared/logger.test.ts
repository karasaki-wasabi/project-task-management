// RED: createLogger() does not exist yet (task 1.5, Requirements 10.1, 10.3, 10.5, 10.6).
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

function collectingStream() {
  const lines: unknown[] = [];
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

describe("createLogger (task 1.5)", () => {
  it("logAccess writes a JSON line with method/path/statusCode/durationMs/requestId", () => {
    const { stream, lines } = collectingStream();
    const logger = createLogger("debug", stream);

    logger.logAccess("req-1", "GET", "/health", 200, 4.2);

    expect(lines).toHaveLength(1);
    const entry = lines[0] as Record<string, unknown>;
    expect(entry.requestId).toBe("req-1");
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/health");
    expect(entry.statusCode).toBe(200);
    expect(entry.durationMs).toBe(4.2);
  });

  it("logBusinessEvent writes the event name, requestId, and entityId", () => {
    const { stream, lines } = collectingStream();
    const logger = createLogger("debug", stream);

    logger.logBusinessEvent("delivery.created", { requestId: "req-2", entityId: "delivery-1" });

    expect(lines).toHaveLength(1);
    const entry = lines[0] as Record<string, unknown>;
    expect(entry.event).toBe("delivery.created");
    expect(entry.requestId).toBe("req-2");
    expect(entry.entityId).toBe("delivery-1");
  });

  it("logError writes the stack trace and requestId", () => {
    const { stream, lines } = collectingStream();
    const logger = createLogger("debug", stream);

    logger.logError(new Error("boom"), { requestId: "req-3" });

    expect(lines).toHaveLength(1);
    const entry = lines[0] as Record<string, unknown>;
    expect(entry.requestId).toBe("req-3");
    const err = entry.err as Record<string, unknown>;
    expect(err.message).toBe("boom");
    expect(typeof err.stack).toBe("string");
  });

  it("respects LOG_LEVEL: a warn-level logger drops debug/info lines", () => {
    const { stream, lines } = collectingStream();
    const logger = createLogger("warn", stream);

    logger.logAccess("req-4", "GET", "/health", 200, 1);
    logger.logBusinessEvent("noop", { requestId: "req-4" });

    expect(lines).toHaveLength(0);
  });

  it("logError is emitted at error level even when LOG_LEVEL is warn", () => {
    const { stream, lines } = collectingStream();
    const logger = createLogger("warn", stream);

    logger.logError(new Error("boom"), { requestId: "req-5" });

    expect(lines).toHaveLength(1);
  });
});

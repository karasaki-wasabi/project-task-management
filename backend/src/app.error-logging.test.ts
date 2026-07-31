// RED: buildApp() does not yet wire the Logging Infrastructure (task 1.5,
// Requirements 10.1, 10.3, 10.5). This proves the requestId correlation
// end-to-end: a deliberately-thrown route produces both an access log line
// and an error log line sharing the same requestId.
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createLogger } from "./shared/logger.js";

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

describe("global error handling + access logging (task 1.5)", () => {
  it("correlates the access log and the error log for a failing request via requestId", async () => {
    const { stream, lines } = collectingStream();
    const logger = createLogger("debug", stream);
    const app = buildApp(
      { DATABASE_URL: "mysql://user:pass@localhost:3306/db", LOG_LEVEL: "debug", PORT: 3000 },
      logger,
    );
    app.get("/boom", async () => {
      throw new Error("intentional failure for task 1.5 verification");
    });

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);

    const accessLine = lines.find((line) => line.path === "/boom" && line.statusCode === 500);
    const errorLine = lines.find((line) => (line.err as Record<string, unknown> | undefined)?.message ===
      "intentional failure for task 1.5 verification");

    expect(accessLine).toBeTruthy();
    expect(errorLine).toBeTruthy();
    expect(accessLine?.requestId).toBe(errorLine?.requestId);
    expect((errorLine?.err as Record<string, unknown>).stack).toEqual(expect.any(String));

    await app.close();
  });

  it("still returns 200 and logs a matching access entry for the healthy path", async () => {
    const { stream, lines } = collectingStream();
    const logger = createLogger("debug", stream);
    const app = buildApp(
      { DATABASE_URL: "mysql://user:pass@localhost:3306/db", LOG_LEVEL: "debug", PORT: 3000 },
      logger,
    );

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const accessLine = lines.find((line) => line.path === "/health");
    expect(accessLine?.statusCode).toBe(200);
    expect(typeof accessLine?.requestId).toBe("string");
    expect(typeof accessLine?.durationMs).toBe("number");

    await app.close();
  });
});

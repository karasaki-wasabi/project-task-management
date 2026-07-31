// Shared logging infrastructure (task 1.5, Requirements 10.1, 10.2, 10.3,
// 10.5, 10.6). Every module logs exclusively through the three helpers below
// so log shape and the requestId correlation key stay consistent across
// access logs, business-event logs, and error logs (design.md "Backend/shared
// (Logging Infrastructure)"). Callers always pass `requestId` explicitly
// (from Fastify's `request.id`) rather than relying on a bound child logger,
// so the same helpers work identically from route handlers and services.
import pino, { type DestinationStream } from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface BusinessEventContext {
  requestId: string;
  entityId?: string;
  [key: string]: unknown;
}

export interface AppLogger {
  logAccess(requestId: string, method: string, path: string, statusCode: number, durationMs: number): void;
  logBusinessEvent(event: string, context: BusinessEventContext): void;
  logError(error: unknown, context: BusinessEventContext): void;
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

export function createLogger(level: LogLevel, destination?: DestinationStream): AppLogger {
  const usePrettyPrint = !destination && process.env.NODE_ENV !== "production";
  const base = destination
    ? pino({ level }, destination)
    : pino(usePrettyPrint ? { level, transport: { target: "pino-pretty" } } : { level });

  return {
    logAccess(requestId, method, path, statusCode, durationMs) {
      base.info({ requestId, method, path, statusCode, durationMs }, "access");
    },
    logBusinessEvent(event, context) {
      base.info({ ...context, event }, "business_event");
    },
    logError(error, context) {
      // Logging must never throw and must never affect business-processing
      // success (design.md Logging Infrastructure Invariants).
      try {
        base.error({ ...context, err: serializeError(error) }, "error");
      } catch {
        // swallow: a broken log sink must not surface as an application error
      }
    },
  };
}

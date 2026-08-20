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
      try {
        base.error({ ...context, err: serializeError(error) }, "error");
      } catch {
      }
    },
  };
}

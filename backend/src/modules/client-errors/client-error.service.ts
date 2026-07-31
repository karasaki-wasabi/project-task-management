// ClientErrorsService (task 8.1, design.md "Backend/client-errors",
// Requirement 10.4). Never persists to the DB (log-only, per design.md
// Implementation Notes: "過剰な永続化を避けるSimplification") — logs
// through the shared Logging Infrastructure (task 1.5) in the same shape a
// server-side exception would be logged in, so client and server errors are
// searchable/correlated the same way.
import { loadEnv } from "../../config/env.js";
import { badRequest } from "../../shared/http-errors.js";
import { createLogger, type AppLogger } from "../../shared/logger.js";
import type { ClientErrorReport } from "./client-error.types.js";

// Guards against a pathologically large body (design.md Implementation
// Notes: "スタックトレースの異常な長さ等は上限を設けて切り詰める").
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 10_000;

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…(truncated)` : value;
}

export function createClientErrorsService(logger: AppLogger) {
  return {
    async report(input: ClientErrorReport, requestId: string): Promise<void> {
      const message = input.message.trim();
      const pageUrl = input.pageUrl.trim();
      if (message.length === 0) {
        throw badRequest("message is required");
      }
      if (pageUrl.length === 0) {
        throw badRequest("pageUrl is required");
      }

      const error = new Error(truncate(message, MAX_MESSAGE_LENGTH));
      if (input.stack) {
        error.stack = truncate(input.stack, MAX_STACK_LENGTH);
      }

      logger.logError(error, { requestId, pageUrl, occurredAt: input.occurredAt });
    },
  };
}

let sharedLogger: AppLogger = createLogger(loadEnv().LOG_LEVEL);

// Test seam (same pattern as shared/business-event-logger.ts, task 10.2):
// lets an app-level test redirect this module's singleton to a collecting
// stream to observe the log line a real HTTP call produces, without
// refactoring `clientErrorsService`'s call sites into a DI factory.
export function setClientErrorLoggerForTests(logger: AppLogger): void {
  sharedLogger = logger;
  clientErrorsService = createClientErrorsService(sharedLogger);
}

export let clientErrorsService = createClientErrorsService(sharedLogger);

import { loadEnv } from "../../config/env.js";
import { badRequest } from "../../shared/http-errors.js";
import { createLogger, type AppLogger } from "../../shared/logger.js";
import type { ClientErrorReport } from "./client-error.types.js";

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

export function setClientErrorLoggerForTests(logger: AppLogger): void {
  sharedLogger = logger;
  clientErrorsService = createClientErrorsService(sharedLogger);
}

export let clientErrorsService = createClientErrorsService(sharedLogger);

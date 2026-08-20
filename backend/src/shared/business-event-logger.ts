import { loadEnv } from "../config/env.js";
import { createLogger, type AppLogger } from "./logger.js";

export let businessEventLogger: AppLogger = createLogger(loadEnv().LOG_LEVEL);

export function setBusinessEventLoggerForTests(logger: AppLogger): void {
  businessEventLogger = logger;
}

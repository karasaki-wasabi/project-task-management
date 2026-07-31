// Shared business-event logger singleton (task 10.2, Requirement 10.2).
// Every Service that performs a broad-impact operation (delivery creation,
// recurring task instance generation, entity deletion) logs through this
// one instance rather than constructing its own, so all business event log
// lines share one Pino stream/format (design.md Logging Infrastructure:
// "各Serviceはlogger.tsが提供するlogBusinessEventのようなヘルパーを通じて
// のみログを出力し、個別にconsole.log等を呼ばない").
//
// `businessEventLogger` is exported as a reassignable `let` binding (ESM
// named exports are live bindings) purely so tests can redirect it to a
// collecting stream via `setBusinessEventLoggerForTests` without requiring
// every consuming Service to be refactored into a dependency-injected
// factory.
import { loadEnv } from "../config/env.js";
import { createLogger, type AppLogger } from "./logger.js";

export let businessEventLogger: AppLogger = createLogger(loadEnv().LOG_LEVEL);

export function setBusinessEventLoggerForTests(logger: AppLogger): void {
  businessEventLogger = logger;
}

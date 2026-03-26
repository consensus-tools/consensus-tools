import type { LifecycleHooks, DecisionResult } from "@consensus-tools/wrapper";
import type { LogEvent, UniversalConfig } from "./types.js";

type LogFn = (event: LogEvent) => void;

/** No-op hooks — used when logging is disabled. */
const NO_OP_HOOKS: LifecycleHooks = {};

function emit(logFn: LogFn, event: string, data: Record<string, unknown>): void {
  logFn({ event, data, timestamp: Date.now() });
}

/**
 * Creates wrapper lifecycle hooks that emit structured log events.
 *
 * Events:
 *   deliberation.start  — before the wrapped function runs
 *   deliberation.result  — after a decision is reached (allow/block/escalate)
 *   deliberation.error   — when deliberation throws
 */
export function createLogger(config: Pick<UniversalConfig, "logger">): LifecycleHooks {
  const { logger } = config;

  if (logger === false) {
    return NO_OP_HOOKS;
  }

  const logFn: LogFn =
    typeof logger === "function"
      ? logger
      : (event: LogEvent) => {
          // eslint-disable-next-line no-console
          console.debug(`[consensus] ${event.event}`, event.data);
        };

  return {
    beforeSubmit(args: unknown[]) {
      emit(logFn, "deliberation.start", { args });
    },
    afterResolve(result: DecisionResult) {
      emit(logFn, "deliberation.result", {
        action: result.action,
        aggregateScore: result.aggregateScore,
        attempt: result.attempt,
        scoresCount: result.scores.length,
      });
    },
    onBlock(result: DecisionResult) {
      emit(logFn, "deliberation.result", {
        action: "block",
        aggregateScore: result.aggregateScore,
        attempt: result.attempt,
        scoresCount: result.scores.length,
      });
    },
    onEscalate(result: DecisionResult) {
      emit(logFn, "deliberation.result", {
        action: "escalate",
        aggregateScore: result.aggregateScore,
        attempt: result.attempt,
        scoresCount: result.scores.length,
      });
    },
  };
}

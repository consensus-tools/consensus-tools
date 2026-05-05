import type { LogEvent, UniversalConfig, LlmDecisionResult } from "./types.js";

type LogFn = (event: LogEvent) => void;

/** No-op emitter — used when logging is disabled. */
const NO_OP: LoggerEmitter = {
  start() { /* noop */ },
  result() { /* noop */ },
  respawn() { /* noop */ },
};

export interface RespawnEvent {
  oldPersonaId: string;
  newPersonaId: string;
  reputation: number;
  reason: string;
}

export interface LoggerEmitter {
  /** Emit deliberation.start before the wrapped function is gated. */
  start(args: unknown[]): void;
  /** Emit deliberation.result after a decision is reached. */
  result(decision: LlmDecisionResult): void;
  /** Emit persona.respawned when a low-reputation LLM persona is replaced. */
  respawn(event: RespawnEvent): void;
}

function emit(logFn: LogFn, event: string, data: Record<string, unknown>): void {
  logFn({ event, data, timestamp: Date.now() });
}

/**
 * Creates a logger emitter that fires structured events on the deliberation lifecycle.
 *
 * Events:
 *   deliberation.start  — before the deliberation runs
 *   deliberation.result — after a decision is reached (allow/block/escalate)
 */
export function createLogger(config: Pick<UniversalConfig, "logger">): LoggerEmitter {
  const { logger } = config;

  if (logger === false) {
    return NO_OP;
  }

  const logFn: LogFn =
    typeof logger === "function"
      ? logger
      : (event: LogEvent) => {
          // eslint-disable-next-line no-console
          console.debug(`[consensus] ${event.event}`, event.data);
        };

  return {
    start(args: unknown[]) {
      emit(logFn, "deliberation.start", { args });
    },
    result(decision: LlmDecisionResult) {
      emit(logFn, "deliberation.result", {
        action: decision.action,
        aggregateScore: decision.aggregateScore,
        policy: decision.policy,
        decisionId: decision.decisionId,
        voteCount: decision.votes.length,
      });
    },
    respawn(event: RespawnEvent) {
      emit(logFn, "persona.respawned", {
        oldPersonaId: event.oldPersonaId,
        newPersonaId: event.newPersonaId,
        reputation: event.reputation,
        reason: event.reason,
      });
    },
  };
}

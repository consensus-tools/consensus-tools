import type { IStorage } from "@consensus-tools/storage";
import type { DecisionResult } from "@consensus-tools/wrapper";

// ── Wrappable ────────────────────────────────────────────────────────
// Any tool executor that consensus can wrap.
// Resolution order: execute > invoke > call (first match wins).

export type ToolExecutor = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export type Wrappable =
  | ToolExecutor
  | { execute: ToolExecutor }
  | { invoke: ToolExecutor }
  | { call: ToolExecutor };

// ── Fail Policy ──────────────────────────────────────────────────────

export type FailPolicy = "closed" | "open";

// ── Logger ───────────────────────────────────────────────────────────

export interface LogEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// ── Config ───────────────────────────────────────────────────────────

export interface UniversalConfig {
  /** Consensus policy name (maps to wrapper strategy via policyToStrategy). */
  policy?: string;
  /** Guard domain names to use as reviewers. */
  guards?: string[];
  /** Persona pack name (reserved for future use). */
  personas?: string;
  /** Behavior on error: 'closed' blocks, 'open' allows. Default: 'closed'. */
  failPolicy?: FailPolicy;
  /** Storage backend: 'memory' for in-memory, or an IStorage instance. Default: 'memory'. */
  storage?: "memory" | IStorage;
  /** Logging: true for console.debug, false to disable, or a custom function. Default: true. */
  logger?: boolean | ((event: LogEvent) => void);
  /** Called after every consensus decision. */
  onDecision?: (decision: DecisionResult<unknown>) => void;
  /** Called when an error occurs during deliberation. */
  onError?: (err: Error, action: unknown) => void;
}

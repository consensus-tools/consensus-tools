import type { IStorage } from "@consensus-tools/storage";
import type { DecisionResult } from "@consensus-tools/wrapper";
import type { PersonaConfig } from "@consensus-tools/personas";

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

// ── Execution Mode ───────────────────────────────────────────────────

export type ExecutionMode = "enforce" | "shadow";

// ── Model Adapter ────────────────────────────────────────────────────
// Provider-agnostic LLM interface. Accepts structured messages,
// returns raw text. Users wrap their SDK call:
//
//   model: (msgs) => openai.chat({ messages: msgs }).then(r => r.choices[0].message.content)
//   model: (msgs) => anthropic.messages.create({ messages: msgs }).then(r => r.content[0].text)

export interface ModelMessage {
  role: "system" | "user";
  content: string;
}

export type ModelAdapter = (messages: ModelMessage[]) => Promise<string>;

// ── Risk Tiers ───────────────────────────────────────────────────────

export type RiskTier = "low" | "high";

export type RiskTierMap = Record<string, RiskTier>;

// ── Feedback ─────────────────────────────────────────────────────────
// Human feedback signal for reputation ground truth.

export interface FeedbackSignal {
  /** The decision ID this feedback relates to. */
  decisionId: string;
  /** "override_block" = human unblocked a blocked call. "flag_miss" = human flagged a missed risk. */
  type: "override_block" | "flag_miss";
}

// ── Logger ───────────────────────────────────────────────────────────

export interface LogEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// ── LLM Decision Result ─────────────────────────────────────────────
// Result from the LLM persona deliberation path.

export interface LlmDecisionResult {
  /** Unique decision ID for feedback reference. */
  decisionId: string;
  /** Final action: allow, block, or escalate. */
  action: "allow" | "block" | "escalate";
  /** Per-persona vote breakdown. */
  votes: Array<{
    personaId: string;
    personaName: string;
    vote: "YES" | "NO" | "REWRITE";
    confidence: number;
    rationale: string;
    source: "llm" | "regex_fallback";
  }>;
  /** Policy used for resolution. */
  policy: string;
  /** Consensus trace from resolveConsensus. */
  consensusTrace: Record<string, unknown>;
  /** Aggregate score (0-1). */
  aggregateScore: number;
}

// ── Config ───────────────────────────────────────────────────────────

export interface UniversalConfig {
  /** Consensus policy name. For regex mode: 'majority', 'supermajority', 'unanimous', 'threshold:X'.
   *  For LLM mode: also supports all 9 core policies (WEIGHTED_REPUTATION, MAJORITY_VOTE, etc.). */
  policy?: string;
  /** Guard domain names to use as reviewers (regex mode). */
  guards?: string[];
  /** Behavior on error: 'closed' blocks, 'open' allows. Default: 'closed'. */
  failPolicy?: FailPolicy;
  /** Storage backend: 'memory' for in-memory, or an IStorage instance. Default: 'memory'. */
  storage?: "memory" | IStorage;
  /** Logging: true for console.debug, false to disable, or a custom function. Default: true. */
  logger?: boolean | ((event: LogEvent) => void);
  /** Called after every consensus decision (both regex and LLM modes). */
  onDecision?: (decision: DecisionResult<unknown> | LlmDecisionResult) => void | Promise<void>;
  /** Called when an error occurs during deliberation. */
  onError?: (err: Error, action: unknown) => void;

  // ── LLM Persona Mode (activated when `model` is provided) ─────────

  /** LLM model adapter. When provided, enables LLM persona mode. */
  model?: ModelAdapter;
  /** Persona pack name. Default: 'default' (security, compliance, operations). */
  pack?: string;
  /** Custom personas (overrides pack). */
  personas?: PersonaConfig[];
  /** Execution mode: 'enforce' blocks on consensus rejection, 'shadow' logs but never blocks. Default: 'enforce'. */
  mode?: ExecutionMode;
  /** Tool risk tier overrides. Keys are tool names, values are 'low' or 'high'. */
  riskTiers?: RiskTierMap;
  /** Human feedback callback for reputation ground truth. */
  onFeedback?: (signal: FeedbackSignal) => void;
  /** Storage for persisting reputation across restarts. Default: in-memory (lost on restart). */
  reputationStore?: IStorage;
  /** Reputation threshold below which persona respawn triggers. Default: 0.15. */
  respawnThreshold?: number;
  /** Per-persona LLM call timeout in milliseconds. Default: 3000. */
  personaTimeout?: number;
}

import crypto from "node:crypto";
import { getPersonasByPack } from "@consensus-tools/personas";
import type { PersonaConfig } from "@consensus-tools/personas";
import { MemoryStorage } from "@consensus-tools/storage";
import type { IStorage } from "@consensus-tools/storage";
import type { Wrappable, UniversalConfig, ToolExecutor, AugmentedExecutor, LlmDecisionResult } from "./types.js";
import { resolveWrappable } from "./resolve.js";
import {
  DEFAULTS,
  DEFAULT_PACK,
  DEFAULT_PERSONA_TIMEOUT_MS,
  DEFAULT_RESPAWN_THRESHOLD,
  resolvePolicyType,
} from "./defaults.js";
import { createLogger } from "./logger.js";
import { ConsensusBlockedError, ConfigError, MissingDependencyError, AdapterLoadError, AdapterExportError } from "./errors.js";
import { ReputationManager } from "./reputation-manager.js";
import { deliberate } from "./persona-reviewer-factory.js";

// ── Storage Helper ───────────────────────────────────────────────────

function resolveStorage(storage: "memory" | IStorage): IStorage {
  if (storage === "memory") {
    return new MemoryStorage();
  }
  return storage;
}

// ── Adapter Loading ──────────────────────────────────────────────────
// Optional adapter packages load via dynamic import. Discriminate the
// failure mode so users with corrupt builds don't get pointed at
// reinstalling a package they already have.

function isModuleNotFound(error: unknown): boolean {
  const e = error as NodeJS.ErrnoException | undefined;
  if (e?.code === "ERR_MODULE_NOT_FOUND" || e?.code === "MODULE_NOT_FOUND") return true;
  // Some test/bundler layers wrap the thrown error and drop `code`.
  // Walk one level into `cause` and also fall back to the stable Node messages.
  const cause = (e as { cause?: NodeJS.ErrnoException } | undefined)?.cause;
  if (cause?.code === "ERR_MODULE_NOT_FOUND" || cause?.code === "MODULE_NOT_FOUND") return true;
  const msg = e?.message ?? "";
  return /Cannot find (module|package)/.test(msg);
}

async function loadAdapter(name: string): Promise<Record<string, unknown>> {
  try {
    return (await import(name)) as Record<string, unknown>;
  } catch (error) {
    if (isModuleNotFound(error)) {
      throw new MissingDependencyError(name, { cause: error });
    }
    throw new AdapterLoadError(name, { cause: error });
  }
}

// Pick a named export, falling back to the CJS-default-wrapped shape some
// bundlers / package managers produce. Uses `in` for existence checks so
// we don't trip strict ESM namespace surfaces that throw on missing-export
// property access instead of returning undefined.
function pickExport<T>(mod: Record<string, unknown>, name: string): T | undefined {
  if (name in mod) {
    const direct = mod[name];
    if (direct !== undefined) return direct as T;
  }
  if (!("default" in mod)) return undefined;
  const def = mod["default"] as Record<string, unknown> | undefined;
  if (def && name in def) {
    return def[name] as T;
  }
  return undefined;
}

// ── Regex-Mode Persona Synthesis ─────────────────────────────────────
// In regex-only mode (no model), we synthesize one persona per configured
// guard domain. Each synthesized persona votes via regex evaluation of its
// own domain. This unifies the voter-tracking story with LLM mode.

function synthesizeRegexPersonas(guards: string[]): PersonaConfig[] {
  return guards.map((domain) => ({
    id: `regex-${domain}`,
    name: `regex:${domain}`,
    role: domain,
  }));
}

// ── Deliberating Executor ────────────────────────────────────────────
// Single executor used for both regex and LLM modes. Branches inside
// deliberate() based on whether config.model is provided.

function createDeliberatingExecutor(
  fn: ToolExecutor,
  config: Required<Pick<UniversalConfig, "policy" | "failPolicy" | "guards" | "storage" | "logger">> & Partial<UniversalConfig>,
): AugmentedExecutor {
  const policyType = resolvePolicyType(config.policy);
  const timeoutMs = config.personaTimeout ?? DEFAULT_PERSONA_TIMEOUT_MS;
  const respawnThreshold = config.respawnThreshold ?? DEFAULT_RESPAWN_THRESHOLD;
  const mode = config.mode ?? "enforce";

  // Personas: LLM mode uses configured personas / pack, regex mode synthesizes from guards
  const personas: PersonaConfig[] = config.model
    ? (config.personas ?? getPersonasByPack(config.pack ?? DEFAULT_PACK))
    : synthesizeRegexPersonas(config.guards);

  // Storage: eager init, audit writes happen here
  const store = resolveStorage(config.storage);
  const storeReady = store.init().catch(() => { /* init failure handled at write time */ });

  // Reputation tracking — works in both modes
  const reputationManager = new ReputationManager(
    personas,
    respawnThreshold,
    config.reputationStore,
  );

  const logger = createLogger({ logger: config.logger });

  // Respawn only makes sense for LLM personas (regex personas are deterministic).
  if (config.model) {
    reputationManager.setRespawnHandler((event) => {
      logger.respawn({
        oldPersonaId: event.oldPersona.id,
        newPersonaId: event.newPersona.id,
        reputation: event.reputation,
        reason: event.reason,
      });
    });
  }

  // Load persisted reputation if a store is provided.
  let reputationReady: Promise<void> | undefined;
  if (config.reputationStore) {
    reputationReady = reputationManager.load().catch((err) => {
      if (config.logger !== false) {
        console.warn("[consensus] Failed to load persisted reputation, starting with defaults:", err); // eslint-disable-line no-console
      }
    });
  }

  const deliberateConfig = {
    model: config.model,
    pack: config.pack,
    personas: config.personas,
    guards: config.guards,
    policyType,
    originalPolicy: config.policy,
    riskTiers: config.riskTiers,
    reputationManager,
    timeoutMs,
  };

  const executor = (async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    if (reputationReady) {
      await reputationReady;
      reputationReady = undefined;
    }
    await storeReady;

    logger.start([toolName, args]);

    try {
      const decision: LlmDecisionResult = await deliberate(deliberateConfig, toolName, args);

      logger.result(decision);

      // User callback — wrapped so user errors don't affect governance
      if (config.onDecision) {
        try {
          await config.onDecision(decision);
        } catch (callbackErr) {
          config.onError?.(
            callbackErr instanceof Error ? callbackErr : new Error(String(callbackErr)),
            { toolName, args, phase: "onDecision" },
          );
        }
      }

      // Audit write (best-effort)
      try {
        await store.update((state) => {
          if (!Array.isArray((state as any).audit)) (state as any).audit = [];
          (state as any).audit.push({
            id: `audit-${crypto.randomUUID()}`,
            at: new Date().toISOString(),
            action: decision.action,
            aggregateScore: decision.aggregateScore,
            policy: decision.policy,
            decisionId: decision.decisionId,
            personaCount: decision.votes.length,
            mode,
          });
        });
      } catch (auditErr) {
        config.onError?.(
          auditErr instanceof Error ? auditErr : new Error(String(auditErr)),
          { toolName, args, phase: "audit_write" },
        );
      }

      // Shadow mode: never block, always execute
      if (mode === "shadow") {
        return fn(toolName, args);
      }

      // Enforce mode: act on decision
      if (decision.action === "allow") {
        return fn(toolName, args);
      }

      // Blocked or escalated
      if (config.failPolicy === "closed") {
        const rationales = decision.votes.map((v) => `${v.personaName}: ${v.rationale}`).join("; ");
        throw new ConsensusBlockedError(
          `Consensus ${decision.action}: score ${decision.aggregateScore.toFixed(2)} ` +
          `[${decision.policy}] (${rationales})`,
        );
      }

      // failPolicy: 'open' — execute despite block
      return fn(toolName, args);
    } catch (err) {
      if (err instanceof ConsensusBlockedError) {
        throw err;
      }

      // Unexpected error during deliberation
      const error = err instanceof Error ? err : new Error(String(err));
      config.onError?.(error, { toolName, args });

      // Shadow mode contract: never block, even on deliberation crash.
      if (mode === "shadow") {
        return fn(toolName, args);
      }

      if (config.failPolicy === "closed") {
        throw new ConsensusBlockedError("Consensus deliberation failed", error);
      }

      // failPolicy: 'open' — execute despite error
      return fn(toolName, args);
    }
  }) as AugmentedExecutor;

  // Feedback is always wired — reputation tracking works in both modes.
  executor.feedback = (signal) => {
    reputationManager.processFeedback(signal);
    config.onFeedback?.(signal);
  };

  return executor;
}

// ── Main Facade ──────────────────────────────────────────────────────

export const consensus = {
  /**
   * Wrap any tool executor with consensus governance.
   *
   * Both regex and LLM modes route through the same pre-execution
   * deliberation pipeline. The wrapped function only runs when consensus
   * allows it (or in shadow mode, or when failPolicy='open' on block).
   *
   * - **Regex mode** (default): synthetic personas vote via guard regex evaluation.
   *   `consensus.wrap(executor)` or `consensus.wrap(executor, { policy: "majority" })`
   *
   * - **LLM persona mode**: personas vote via parallel LLM calls.
   *   `consensus.wrap(executor, { model: myLlm, policy: "weighted_reputation" })`
   *
   * @param wrappable - A function, or object with .execute/.invoke/.call
   * @param config - Optional configuration overrides
   * @returns A wrapped function with a `.feedback()` method for reputation updates
   */
  wrap(
    wrappable: Wrappable,
    config?: Partial<UniversalConfig>,
  ): AugmentedExecutor {
    const fn = resolveWrappable(wrappable);
    const merged = { ...DEFAULTS, ...config };

    // Validate: regex mode requires non-empty guards (LLM mode falls back to personas)
    if (!merged.model && (!Array.isArray(merged.guards) || merged.guards.length === 0)) {
      throw new ConfigError(
        "`guards` must be a non-empty array in regex mode (no `model` configured). " +
        "Either provide guards or pass a model to enable LLM persona mode.",
      );
    }

    // Warn: personas without a model are silently ignored (regex mode synthesizes from guards).
    if (!merged.model && config?.personas) {
      console.warn( // eslint-disable-line no-console
        "[consensus] `personas` is only used when a `model` is configured. " +
        "In regex mode, personas are synthesized from `guards`. The provided `personas` will be ignored.",
      );
    }

    // Production warnings (raw console.warn — these fire at construction, before
    // the logger emitter is built, so they cannot route through `config.logger`).
    const isProduction = typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production";
    if (isProduction && merged.failPolicy === "open") {
      console.warn("[consensus] WARNING: failPolicy 'open' in production — errors will pass through unchecked"); // eslint-disable-line no-console
    }
    if (isProduction && merged.storage === "memory") {
      console.warn("[consensus] WARNING: storage 'memory' in production — decisions are not persisted"); // eslint-disable-line no-console
    }

    return createDeliberatingExecutor(fn, merged);
  },

  /**
   * LangChain adapter — dynamically loads @consensus-tools/langchain.
   */
  async langchain(_chain: unknown, config?: Partial<UniversalConfig>): Promise<unknown> {
    const mod = await loadAdapter("@consensus-tools/langchain");
    const HandlerClass = pickExport<new (config: Record<string, unknown>) => unknown>(
      mod,
      "ConsensusGuardCallbackHandler",
    );
    if (!HandlerClass) {
      throw new AdapterExportError("@consensus-tools/langchain", "ConsensusGuardCallbackHandler");
    }
    return new HandlerClass({
      policy: config?.policy ?? "majority",
      guards: config?.guards,
      onDecision: config?.onDecision ? (d: unknown) => config.onDecision?.(d as any) : undefined,
    });
  },

  /**
   * AI SDK (Vercel) adapter — dynamically loads @consensus-tools/ai-sdk.
   */
  async aiSdk(fn: unknown, config?: Partial<UniversalConfig>): Promise<unknown> {
    const mod = await loadAdapter("@consensus-tools/ai-sdk");
    const create = pickExport<(fn: unknown, config?: unknown) => unknown>(mod, "createGuardedGenerate");
    if (typeof create !== "function") {
      throw new AdapterExportError("@consensus-tools/ai-sdk", "createGuardedGenerate");
    }
    return create(fn, config);
  },

  /**
   * MCP adapter — dynamically loads @consensus-tools/mcp.
   */
  async mcp(config?: Partial<UniversalConfig>): Promise<unknown> {
    const mod = await loadAdapter("@consensus-tools/mcp");
    const create = pickExport<(config?: unknown) => unknown>(mod, "createMcpServer");
    if (typeof create !== "function") {
      throw new AdapterExportError("@consensus-tools/mcp", "createMcpServer");
    }
    return create(config);
  },
};

// ── Re-exports ───────────────────────────────────────────────────────
export { resolveWrappable } from "./resolve.js";
export { resolvePolicyType, DEFAULTS, DEFAULT_GUARD, DEFAULT_POLICY, DEFAULT_PERSONA_TRIO, DEFAULT_PERSONA_COUNT, DEFAULT_PACK } from "./defaults.js";
export { createLogger } from "./logger.js";
export { ConsensusBlockedError, MissingDependencyError, AdapterLoadError, AdapterExportError, ConfigError } from "./errors.js";
export { ReputationManager } from "./reputation-manager.js";
export { classifyTool } from "./risk-tiers.js";
export { deliberate } from "./persona-reviewer-factory.js";
export type {
  Wrappable, ToolExecutor, AugmentedExecutor, UniversalConfig, FailPolicy, ExecutionMode,
  LogEvent, ModelAdapter, ModelMessage, LlmDecisionResult, FeedbackSignal,
  RiskTier, RiskTierMap,
} from "./types.js";

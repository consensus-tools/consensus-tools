import crypto from "node:crypto";
import { consensus as wrapWithConsensus } from "@consensus-tools/wrapper";
import type { DecisionResult, ReviewerFn, LifecycleHooks } from "@consensus-tools/wrapper";
import { createGuardTemplate, GUARD_CONFIGS } from "@consensus-tools/guards";
import { getPersonasByPack } from "@consensus-tools/personas";
import { MemoryStorage } from "@consensus-tools/storage";
import type { IStorage } from "@consensus-tools/storage";
import type { Wrappable, UniversalConfig, ToolExecutor, LlmDecisionResult } from "./types.js";
import { resolveWrappable } from "./resolve.js";
import {
  DEFAULTS,
  DEFAULT_PERSONA_TRIO,
  DEFAULT_PACK,
  DEFAULT_PERSONA_TIMEOUT_MS,
  DEFAULT_RESPAWN_THRESHOLD,
  policyToStrategy,
  resolvePolicyType,
} from "./defaults.js";
import { createLogger } from "./logger.js";
import { ConsensusBlockedError, MissingDependencyError } from "./errors.js";
import { ReputationManager } from "./reputation-manager.js";
import { deliberate } from "./persona-reviewer-factory.js";

// ── Persona-as-guard templates (regex-only mode) ─────────────────────

function createDefaultReviewers(): ReviewerFn[] {
  return DEFAULT_PERSONA_TRIO.map((domain) => {
    const config = GUARD_CONFIGS[domain];
    if (!config) {
      throw new Error(`No guard config for default persona domain: ${domain}`);
    }
    return createGuardTemplate(domain, config).asReviewer();
  });
}

function createReviewersForGuards(guards: string[]): ReviewerFn[] {
  return guards.map((domain) => {
    const config = GUARD_CONFIGS[domain] ?? {
      description: `Custom guard: ${domain}`,
      rules: () => [{ evaluator: domain, vote: "YES" as const, reason: "No rules configured", risk: 0.1 }],
    };
    return createGuardTemplate(domain, config).asReviewer();
  });
}

// ── Storage helpers ──────────────────────────────────────────────────

function resolveStorage(storage: "memory" | IStorage): IStorage {
  if (storage === "memory") {
    return new MemoryStorage();
  }
  return storage;
}

function createStorageHooks(store: IStorage): LifecycleHooks {
  return {
    // afterResolve fires for ALL outcomes (allow, block, escalate).
    // No separate onBlock hook needed (was duplicating audit entries).
    async afterResolve(result: DecisionResult) {
      await store.update((state) => {
        state.audit.push({
          id: `audit-${crypto.randomUUID()}`,
          at: new Date().toISOString(),
          action: result.action,
          aggregateScore: result.aggregateScore,
          attempt: result.attempt,
          scoresCount: result.scores.length,
        } as any);
      });
    },
  };
}

function mergeHooks(...hookSets: LifecycleHooks[]): LifecycleHooks {
  return {
    async beforeSubmit(args: unknown[]) {
      for (const h of hookSets) await h.beforeSubmit?.(args);
    },
    async afterResolve(result: DecisionResult) {
      for (const h of hookSets) await h.afterResolve?.(result);
    },
    async onBlock(result: DecisionResult) {
      for (const h of hookSets) await h.onBlock?.(result);
    },
    async onEscalate(result: DecisionResult) {
      for (const h of hookSets) await h.onEscalate?.(result);
    },
  };
}

// ── LLM Persona Mode Setup ──────────────────────────────────────────

function createLlmExecutor(
  fn: ToolExecutor,
  config: Required<Pick<UniversalConfig, "policy" | "failPolicy">> & Partial<UniversalConfig>,
): ToolExecutor {
  const pack = config.pack ?? DEFAULT_PACK;
  const personas = config.personas ?? getPersonasByPack(pack);
  const policyType = resolvePolicyType(config.policy);
  const timeoutMs = config.personaTimeout ?? DEFAULT_PERSONA_TIMEOUT_MS;
  const respawnThreshold = config.respawnThreshold ?? DEFAULT_RESPAWN_THRESHOLD;
  const mode = config.mode ?? "enforce";

  // Create reputation manager
  const reputationManager = new ReputationManager(
    personas,
    respawnThreshold,
    config.reputationStore,
  );

  // Wire respawn events to logger
  reputationManager.setRespawnHandler((event) => {
    if (config.logger !== false) {
      const logFn = typeof config.logger === "function"
        ? config.logger
        : (e: any) => console.debug("[consensus]", e.event, e.data); // eslint-disable-line no-console
      logFn({
        event: "persona.respawned",
        data: {
          oldPersonaId: event.oldPersona.id,
          newPersonaId: event.newPersona.id,
          reputation: event.reputation,
          reason: event.reason,
        },
        timestamp: Date.now(),
      });
    }
  });

  // Load persisted reputation if store is configured.
  // Track readiness so early calls don't race against the load.
  let reputationReady: Promise<void> | undefined;
  if (config.reputationStore) {
    reputationReady = reputationManager.load().catch((err) => {
      if (config.logger !== false) {
        console.warn("[consensus] Failed to load persisted reputation, starting with defaults:", err); // eslint-disable-line no-console
      }
    });
  }

  // Build the deliberation config
  const deliberateConfig = {
    model: config.model!,
    pack,
    personas: config.personas,
    guards: config.guards ?? DEFAULTS.guards,
    policyType,
    originalPolicy: config.policy,
    riskTiers: config.riskTiers,
    reputationManager,
    timeoutMs,
  };

  return async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    // Wait for reputation load before first deliberation
    if (reputationReady) {
      await reputationReady;
      reputationReady = undefined;
    }

    try {
      const decision: LlmDecisionResult = await deliberate(deliberateConfig, toolName, args);

      // Fire onDecision callback (wrapped in try/catch so user callback errors
      // don't affect governance decisions)
      if (config.onDecision) {
        try {
          await config.onDecision(decision);
        } catch (callbackErr) {
          config.onError?.(callbackErr instanceof Error ? callbackErr : new Error(String(callbackErr)), { toolName, args, phase: "onDecision" });
        }
      }

      // Shadow mode: always allow, just log. Never blocks, even if callback threw.
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

      // failPolicy: 'open' — execute anyway
      return fn(toolName, args);
    } catch (err) {
      if (err instanceof ConsensusBlockedError) {
        throw err;
      }

      // Unexpected error during LLM deliberation — fall back to executing the tool
      const error = err instanceof Error ? err : new Error(String(err));
      config.onError?.(error, { toolName, args });

      if (config.failPolicy === "closed") {
        throw new ConsensusBlockedError("LLM deliberation failed", error);
      }

      // failPolicy: 'open' — execute despite error
      return fn(toolName, args);
    }
  };
}

// ── Main Facade ──────────────────────────────────────────────────────

export const consensus = {
  /**
   * Wrap any tool executor with consensus governance.
   *
   * Two modes:
   * - **Regex mode** (default): Fast, deterministic pattern-matching guards.
   *   `consensus.wrap(executor)` or `consensus.wrap(executor, { policy: "majority" })`
   *
   * - **LLM persona mode**: Multi-model deliberation with reputation tracking.
   *   `consensus.wrap(executor, { model: myLlm, policy: "weighted_reputation" })`
   *   Activated when `model` is provided in config.
   *
   * @param wrappable - A function, or object with .execute/.invoke/.call
   * @param config - Optional configuration overrides
   * @returns A wrapped function that runs consensus deliberation before allowing execution
   */
  wrap(
    wrappable: Wrappable,
    config?: Partial<UniversalConfig>,
  ): ToolExecutor {
    const fn = resolveWrappable(wrappable);
    const merged = { ...DEFAULTS, ...config };

    // Production warnings
    const isProduction = typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production";
    if (isProduction && merged.failPolicy === "open") {
      console.warn("[consensus] WARNING: failPolicy 'open' in production — errors will pass through unchecked"); // eslint-disable-line no-console
    }
    if (isProduction && merged.storage === "memory" && !config?.model) {
      console.warn("[consensus] WARNING: storage 'memory' in production — decisions are not persisted"); // eslint-disable-line no-console
    }

    // ── LLM Persona Mode ──────────────────────────────────────────────
    if (config?.model) {
      return createLlmExecutor(fn, merged);
    }

    // ── Regex-Only Mode (unchanged from v0.8.0) ───────────────────────
    const strategy = policyToStrategy(merged.policy);

    const isDefaultGuards =
      Array.isArray(merged.guards) &&
      merged.guards.length === DEFAULTS.guards.length &&
      merged.guards.every((g, i) => g === DEFAULTS.guards[i]);

    const reviewers: ReviewerFn[] = isDefaultGuards
      ? createDefaultReviewers()
      : createReviewersForGuards(merged.guards);

    const loggerHooks = createLogger({ logger: merged.logger });
    const store = resolveStorage(merged.storage);
    const storageHooks = createStorageHooks(store);
    const hooks = mergeHooks(loggerHooks, storageHooks);

    const wrapped = wrapWithConsensus<unknown>({
      name: "universal",
      fn: async (...args: unknown[]) => {
        const [toolName, toolArgs] = args as [string, Record<string, unknown>];
        return fn(toolName, toolArgs);
      },
      reviewers,
      strategy,
      hooks,
    });

    return async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
      try {
        const result: DecisionResult<unknown> = await wrapped(toolName, args);

        if (merged.onDecision) {
          await merged.onDecision(result);
        }

        if (result.action === "allow") {
          return result.output;
        }

        if (merged.failPolicy === "closed") {
          throw new ConsensusBlockedError(
            `Consensus ${result.action}: aggregate score ${result.aggregateScore.toFixed(2)} ` +
            `(${result.scores.map((s) => s.rationale ?? "no rationale").join("; ")})`,
          );
        }

        return fn(toolName, args);
      } catch (err) {
        if (err instanceof ConsensusBlockedError) {
          throw err;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        merged.onError?.(error, { toolName, args });

        if (merged.failPolicy === "closed") {
          throw new ConsensusBlockedError("Consensus deliberation failed", error);
        }

        return fn(toolName, args);
      }
    };
  },

  /**
   * LangChain adapter — dynamically loads @consensus-tools/langchain.
   */
  async langchain(_chain: unknown, config?: Partial<UniversalConfig>): Promise<unknown> {
    let mod: Record<string, unknown>;
    try {
      mod = await import("@consensus-tools/langchain") as Record<string, unknown>;
    } catch {
      throw new MissingDependencyError("@consensus-tools/langchain");
    }

    const HandlerClass = mod["ConsensusGuardCallbackHandler"] as
      | (new (config: Record<string, unknown>) => unknown)
      | undefined;

    if (!HandlerClass) {
      throw new Error("@consensus-tools/langchain does not export ConsensusGuardCallbackHandler");
    }

    const handler = new HandlerClass({
      policy: config?.policy ?? "majority",
      guards: config?.guards,
      onDecision: config?.onDecision ? (d: unknown) => config.onDecision?.(d as any) : undefined,
    });

    return handler;
  },

  /**
   * AI SDK (Vercel) adapter — dynamically loads @consensus-tools/ai-sdk.
   */
  async aiSdk(fn: unknown, config?: Partial<UniversalConfig>): Promise<unknown> {
    let mod: Record<string, unknown>;
    try {
      mod = await import("@consensus-tools/ai-sdk") as Record<string, unknown>;
    } catch {
      throw new MissingDependencyError("@consensus-tools/ai-sdk");
    }
    if (typeof mod["createGuardedGenerate"] === "function") {
      return (mod["createGuardedGenerate"] as (fn: unknown, config?: unknown) => unknown)(fn, config);
    }
    throw new Error("@consensus-tools/ai-sdk does not export createGuardedGenerate");
  },

  /**
   * MCP adapter — dynamically loads @consensus-tools/mcp.
   */
  async mcp(config?: Partial<UniversalConfig>): Promise<unknown> {
    let mod: Record<string, unknown>;
    try {
      mod = await import("@consensus-tools/mcp") as Record<string, unknown>;
    } catch {
      throw new MissingDependencyError("@consensus-tools/mcp");
    }
    if (typeof mod["createMcpServer"] === "function") {
      return (mod["createMcpServer"] as (config?: unknown) => unknown)(config);
    }
    throw new Error("@consensus-tools/mcp does not export createMcpServer");
  },
};

// ── Re-exports ───────────────────────────────────────────────────────
export { resolveWrappable } from "./resolve.js";
export { policyToStrategy, resolvePolicyType, DEFAULTS, DEFAULT_GUARD, DEFAULT_POLICY, DEFAULT_PERSONA_TRIO, DEFAULT_PERSONA_COUNT, DEFAULT_PACK } from "./defaults.js";
export { createLogger } from "./logger.js";
export { ConsensusBlockedError, MissingDependencyError, ConfigError } from "./errors.js";
export { ReputationManager } from "./reputation-manager.js";
export { classifyTool } from "./risk-tiers.js";
export { deliberate } from "./persona-reviewer-factory.js";
export type {
  Wrappable, ToolExecutor, UniversalConfig, FailPolicy, ExecutionMode,
  LogEvent, ModelAdapter, ModelMessage, LlmDecisionResult, FeedbackSignal,
  RiskTier, RiskTierMap,
} from "./types.js";

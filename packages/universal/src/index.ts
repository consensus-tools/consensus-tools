import { consensus as wrapWithConsensus } from "@consensus-tools/wrapper";
import type { DecisionResult, ReviewerFn, LifecycleHooks } from "@consensus-tools/wrapper";
import { createGuardTemplate } from "@consensus-tools/guards";
import { MemoryStorage } from "@consensus-tools/storage";
import type { IStorage } from "@consensus-tools/storage";
import type { Wrappable, UniversalConfig, ToolExecutor } from "./types.js";
import { resolveWrappable } from "./resolve.js";
import { DEFAULTS, DEFAULT_PERSONA_TRIO, policyToStrategy } from "./defaults.js";
import { createLogger } from "./logger.js";
import { ConsensusBlockedError, MissingDependencyError } from "./errors.js";

// ── Helper: recursively extract all strings from a value ─────────────

function extractStrings(obj: unknown): string {
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(extractStrings).join(" ");
  if (obj && typeof obj === "object") return Object.values(obj).map(extractStrings).join(" ");
  return String(obj);
}

// ── Guard rule factories keyed by persona domain ─────────────────────

const GUARD_CONFIGS: Record<string, Parameters<typeof createGuardTemplate>[1]> = {
  security: {
    description: "Security reviewer — flags dangerous operations, secret exposure, and injection risks",
    rules: (payload) => {
      const text = extractStrings(payload);
      if (/\b(delete|drop|truncate|rm\s+-rf)\b/i.test(text)) {
        return [{ evaluator: "security", vote: "NO", reason: "Destructive operation detected", risk: 0.9 }];
      }
      if (/\b(password|secret|token|api[_-]?key)\b/i.test(text)) {
        return [{ evaluator: "security", vote: "REWRITE", reason: "Potential secret exposure", risk: 0.7 }];
      }
      return [{ evaluator: "security", vote: "YES", reason: "No security concerns", risk: 0.1 }];
    },
    hardBlockPatterns: [
      /\bexec\s*\(\s*['"].*rm\s+-rf/i,
      /\bchild_process\b/i,
      /\b(execSync|spawnSync|spawn|fork)\s*\(/i,
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /import\s*\(\s*['"]child_process['"]\s*\)/,
    ],
  },
  compliance: {
    description: "Compliance reviewer — flags PII, regulated data, and policy violations",
    rules: (payload) => {
      const text = extractStrings(payload);
      if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
        return [{ evaluator: "compliance", vote: "NO", reason: "SSN pattern detected", risk: 0.95 }];
      }
      if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
        return [{ evaluator: "compliance", vote: "REWRITE", reason: "Email PII detected", risk: 0.5 }];
      }
      return [{ evaluator: "compliance", vote: "YES", reason: "No compliance concerns", risk: 0.1 }];
    },
  },
  "user-impact": {
    description: "User-impact reviewer — flags irreversible actions and high blast-radius operations",
    rules: (payload) => {
      const text = extractStrings(payload);
      if (/\b(broadcast|mass[_-]?(email|notify|delete))\b/i.test(text)) {
        return [{ evaluator: "user-impact", vote: "NO", reason: "Mass operation affects many users", risk: 0.85 }];
      }
      if (/\b(irreversible|permanent|cannot\s+undo)\b/i.test(text)) {
        return [{ evaluator: "user-impact", vote: "REWRITE", reason: "Irreversible action flagged", risk: 0.6 }];
      }
      return [{ evaluator: "user-impact", vote: "YES", reason: "Low user impact", risk: 0.1 }];
    },
  },
};

// ── Persona-as-guard templates ───────────────────────────────────────
// Each "persona" is a lightweight guard template focused on a risk area.

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
    async afterResolve(result: DecisionResult) {
      await store.update((state) => {
        state.audit.push({
          id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: new Date().toISOString(),
          action: result.action,
          aggregateScore: result.aggregateScore,
          attempt: result.attempt,
          scoresCount: result.scores.length,
        } as any);
      });
    },
    async onBlock(result: DecisionResult) {
      await store.update((state) => {
        state.audit.push({
          id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: new Date().toISOString(),
          action: "block",
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

// ── Main Facade ──────────────────────────────────────────────────────

export const consensus = {
  /**
   * Wrap any tool executor with consensus governance.
   *
   * @param wrappable - A function, or object with .execute/.invoke/.call
   * @param config - Optional configuration overrides
   * @returns A wrapped function that runs consensus deliberation before allowing execution
   */
  wrap(
    wrappable: Wrappable,
    config?: Partial<UniversalConfig>,
  ): ToolExecutor {
    // 1. Resolve the wrappable to a plain function
    const fn = resolveWrappable(wrappable);

    // 2. Merge config with defaults
    const merged = { ...DEFAULTS, ...config };
    const strategy = policyToStrategy(merged.policy);

    // 3. Production warnings
    const isProduction = typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production";
    if (isProduction && merged.failPolicy === "open") {
      // eslint-disable-next-line no-console
      console.warn("[consensus] WARNING: failPolicy 'open' in production — errors will pass through unchecked");
    }
    if (isProduction && merged.storage === "memory") {
      // eslint-disable-next-line no-console
      console.warn("[consensus] WARNING: storage 'memory' in production — decisions are not persisted");
    }

    // 4. Create guard reviewers — use custom guards if provided and different from default
    const isDefaultGuards =
      Array.isArray(merged.guards) &&
      merged.guards.length === DEFAULTS.guards.length &&
      merged.guards.every((g, i) => g === DEFAULTS.guards[i]);

    const reviewers: ReviewerFn[] = isDefaultGuards
      ? createDefaultReviewers()
      : createReviewersForGuards(merged.guards);

    // 5. Create logger hooks
    const loggerHooks = createLogger({ logger: merged.logger });

    // 6. Wire storage for audit artifacts
    const store = resolveStorage(merged.storage);
    const storageHooks = createStorageHooks(store);
    const hooks = mergeHooks(loggerHooks, storageHooks);

    // 7. Compose with wrapper/consensus<T>()
    const wrapped = wrapWithConsensus<unknown>({
      name: "universal",
      fn: async (...args: unknown[]) => {
        // The wrapped fn receives (toolName, toolArgs) as its arguments
        const [toolName, toolArgs] = args as [string, Record<string, unknown>];
        return fn(toolName, toolArgs);
      },
      reviewers,
      strategy,
      hooks,
    });

    // 8. Return a ToolExecutor that catches errors and applies failPolicy
    return async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
      try {
        const result: DecisionResult<unknown> = await wrapped(toolName, args);

        // Fire onDecision callback (await to ensure it completes before throwing)
        if (merged.onDecision) {
          await merged.onDecision(result);
        }

        if (result.action === "allow") {
          return result.output;
        }

        // Blocked, escalated, or retried-out
        if (merged.failPolicy === "closed") {
          throw new ConsensusBlockedError(
            `Consensus ${result.action}: aggregate score ${result.aggregateScore.toFixed(2)} ` +
            `(${result.scores.map((s) => s.rationale ?? "no rationale").join("; ")})`,
          );
        }

        // failPolicy: 'open' — execute anyway
        return fn(toolName, args);
      } catch (err) {
        if (err instanceof ConsensusBlockedError) {
          throw err;
        }

        // Unexpected error during deliberation
        const error = err instanceof Error ? err : new Error(String(err));
        merged.onError?.(error, { toolName, args });

        if (merged.failPolicy === "closed") {
          throw new ConsensusBlockedError("Consensus deliberation failed", error);
        }

        // failPolicy: 'open' — execute despite error
        return fn(toolName, args);
      }
    };
  },

  /**
   * LangChain adapter — dynamically loads @consensus-tools/langchain.
   *
   * Returns a `ConsensusGuardCallbackHandler` that intercepts all tool calls and
   * runs them through consensus deliberation. Attach it to your chain or agent
   * via the `callbacks` option to govern all tool calls:
   *
   * ```ts
   * const handler = await consensus.langchain(null, { policy: "majority" });
   * const result = await agent.invoke({ input: "..." }, { callbacks: [handler] });
   * ```
   */
  async langchain(_chain: unknown, config?: Partial<UniversalConfig>): Promise<unknown> {
    let mod: Record<string, unknown>;
    try {
      mod = await import("@consensus-tools/langchain") as Record<string, unknown>;
    } catch {
      throw new MissingDependencyError("@consensus-tools/langchain");
    }

    // Create a guard callback handler with the user's config
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

    // Return the handler — the user attaches it to their chain/agent
    // This is the LangChain pattern: you don't wrap the chain, you add callbacks
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
export { policyToStrategy, DEFAULTS, DEFAULT_GUARD, DEFAULT_POLICY, DEFAULT_PERSONA_TRIO, DEFAULT_PERSONA_COUNT } from "./defaults.js";
export { createLogger } from "./logger.js";
export { ConsensusBlockedError, MissingDependencyError, ConfigError } from "./errors.js";
export type { Wrappable, ToolExecutor, UniversalConfig, FailPolicy, LogEvent } from "./types.js";

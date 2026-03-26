# @consensus-tools/universal

**Single-model AI pipelines are a reliability failure.** One model, one prompt, one answer — no accountability. When an autonomous agent decides to send an email, merge code, or escalate permissions, nothing checks whether that's a good idea.

`@consensus-tools/universal` adds a governance layer in one line. Three rule-based reviewers (security, compliance, user-impact) screen every tool call using pattern matching — no LLM calls, no network requests, sub-millisecond overhead. Block, allow, or escalate based on a configurable policy. Adapters for LangChain, Vercel AI SDK, and MCP are loaded on demand.

## Install

```bash
pnpm add @consensus-tools/universal
```

Optional peer dependencies (install only what you need):

```bash
pnpm add @consensus-tools/langchain   # LangChain adapter
pnpm add @consensus-tools/ai-sdk      # Vercel AI SDK adapter
pnpm add @consensus-tools/mcp         # MCP adapter
```

---

## Quick Start

### wrap — any tool executor

```typescript
import { consensus } from "@consensus-tools/universal";

// Your existing tool executor
async function myExecutor(toolName: string, args: Record<string, unknown>) {
  // call the actual tool
}

// Wrap it — all calls now go through deliberation
const safe = consensus.wrap(myExecutor);

const result = await safe("send_email", {
  to: "user@example.com",
  body: "Your invoice is attached.",
});
```

Objects with `.execute`, `.invoke`, or `.call` methods are also accepted:

```typescript
const safe = consensus.wrap(myToolRunner);         // ToolExecutor function
const safe = consensus.wrap({ execute: fn });      // .execute method
const safe = consensus.wrap({ invoke: fn });       // .invoke method
const safe = consensus.wrap({ call: fn });         // .call method
```

---

### langchain — LangChain chain adapter

```typescript
import { consensus } from "@consensus-tools/universal";
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent } from "langchain/agents";

const model = new ChatOpenAI({ model: "gpt-4o" });
const chain = createOpenAIFunctionsAgent({ llm: model, tools, prompt });

// Wrap the chain — consensus reviews every tool call before execution
const safeChain = await consensus.langchain(chain, {
  policy: "supermajority",
  failPolicy: "closed",
});
```

Requires `@consensus-tools/langchain` as a peer dependency.

---

### aiSdk — Vercel AI SDK adapter

```typescript
import { consensus } from "@consensus-tools/universal";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

async function generate(prompt: string) {
  return generateText({ model: openai("gpt-4o"), prompt });
}

// Wrap the generate function
const safeGenerate = await consensus.aiSdk(generate, {
  policy: "majority",
  guards: ["agent_action", "publish"],
});

const result = await safeGenerate("Summarize last quarter's results.");
```

Requires `@consensus-tools/ai-sdk` as a peer dependency.

---

### mcp — MCP server adapter

```typescript
import { consensus } from "@consensus-tools/universal";

// Returns a guarded MCP server instance
const server = await consensus.mcp({
  policy: "unanimous",
  failPolicy: "closed",
  logger: (event) => console.log("[mcp]", event),
});
```

Requires `@consensus-tools/mcp` as a peer dependency.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      @consensus-tools/universal                      │
│                                                                      │
│   consensus.wrap()   consensus.langchain()  consensus.aiSdk()        │
│   consensus.mcp()                                                    │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ resolves Wrappable → ToolExecutor
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      @consensus-tools/wrapper                        │
│   consensus<T>({ fn, reviewers, strategy, hooks })                   │
│   aggregateScores() → DecisionResult<T>                              │
│   action: "allow" | "block" | "retry" | "escalate"                  │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ reviewer functions
        ┌──────────┼───────────────┐
        ▼          ▼               ▼
  [security]  [compliance]  [user-impact]
  GuardTemplate  GuardTemplate  GuardTemplate
        │
        └── built via @consensus-tools/guards
            createGuardTemplate() → .asReviewer()

┌─────────────────────────────────────────────────────────────────────┐
│                   Configurable Guard Domains                         │
│   send_email  code_merge  publish  support_reply                     │
│   agent_action  deployment  permission_escalation                    │
│                   @consensus-tools/guards (Tier 1)                   │
└─────────────────────────────────────────────────────────────────────┘

Tier layout (consensus-tools layered architecture):
  Tier 0  schemas, secrets
  Tier 1  guards, telemetry, evals, integrations, notifications
  Tier 2  core (job engine, ledger), policies (9 algorithms)
  Tier 3  workflows, wrapper
  Tier 4  universal (this package), sdk-node, mcp, openclaw, cli
```

---

## API Reference

### `consensus.wrap(wrappable, config?)`

Synchronously wraps a tool executor with consensus governance. Returns a `ToolExecutor`.

```typescript
function wrap(wrappable: Wrappable, config?: Partial<UniversalConfig>): ToolExecutor
```

| Parameter | Type | Description |
|---|---|---|
| `wrappable` | `Wrappable` | Function, or object with `.execute` / `.invoke` / `.call` |
| `config` | `Partial<UniversalConfig>` | Optional configuration (see Config Reference below) |

**Returns:** `ToolExecutor` — `(toolName: string, args: Record<string, unknown>) => Promise<unknown>`

---

### `consensus.langchain(chain, config?)`

Async adapter for LangChain chains. Dynamically imports `@consensus-tools/langchain`.

```typescript
async function langchain(chain: unknown, config?: Partial<UniversalConfig>): Promise<unknown>
```

Throws `MissingDependencyError` if `@consensus-tools/langchain` is not installed.

---

### `consensus.aiSdk(fn, config?)`

Async adapter for Vercel AI SDK generate functions. Dynamically imports `@consensus-tools/ai-sdk`.

```typescript
async function aiSdk(fn: unknown, config?: Partial<UniversalConfig>): Promise<unknown>
```

Throws `MissingDependencyError` if `@consensus-tools/ai-sdk` is not installed.

---

### `consensus.mcp(config?)`

Async adapter that creates a guarded MCP server. Dynamically imports `@consensus-tools/mcp`.

```typescript
async function mcp(config?: Partial<UniversalConfig>): Promise<unknown>
```

Throws `MissingDependencyError` if `@consensus-tools/mcp` is not installed.

---

## Configuration Reference

All options are optional. Defaults are shown.

```typescript
interface UniversalConfig {
  policy?:     string;                              // "majority"
  guards?:     string[];                            // ["agent_action"]
  failPolicy?: "closed" | "open";                  // "closed"
  storage?:    "memory" | IStorage;                // "memory"
  logger?:     boolean | ((event: LogEvent) => void); // true
  onDecision?: (decision: DecisionResult<unknown>) => void;
  onError?:    (err: Error, action: unknown) => void;
}
```

### `policy`

Maps to an aggregation strategy for the three built-in reviewers.

| Value | Strategy |
|---|---|
| `"majority"` (default) | More than half of reviewers approve |
| `"supermajority"` | Weighted average score >= 0.67 |
| `"unanimous"` | Every reviewer must approve |
| `"threshold:X"` | Weighted average score >= X (0–1) |

### `guards`

Guard domain names to use as reviewers. Defaults to `["agent_action"]`. The seven built-in domains are documented in the Guard Domains section below.

### `failPolicy`

| Value | Behavior on deliberation error or block |
|---|---|
| `"closed"` (default) | Throw `ConsensusBlockedError` — the tool call does not execute |
| `"open"` | Allow the tool call to proceed despite the deliberation result |

**`failPolicy: "open"` effectively disables governance.** It exists for development and testing only. In production, use `"closed"` (the default) and handle `ConsensusBlockedError` in your error path.

If you want to observe governance decisions without blocking in production, use `onDecision` instead:

```typescript
consensus.wrap(executor, {
  failPolicy: "closed",
  onDecision: (result) => {
    // Shadow mode: log every decision, including blocks, for analysis
    metrics.track("consensus.decision", { action: result.action, score: result.aggregateScore });
  },
});
```

**Production warning:** `failPolicy: "open"` and `storage: "memory"` both emit `console.warn` when `NODE_ENV=production`.

### `storage`

| Value | Description |
|---|---|
| `"memory"` (default) | In-process storage — decisions are not persisted across restarts |
| `IStorage` | Any storage backend implementing the `IStorage` interface (e.g., `@consensus-tools/storage`) |

### `logger`

| Value | Description |
|---|---|
| `true` (default) | Emit structured log events via `console.debug` |
| `false` | Disable all logging |
| `(event: LogEvent) => void` | Custom log handler |

```typescript
// Custom logger example
consensus.wrap(executor, {
  logger: (event) => myObservability.track(event.event, event.data),
});
```

### `onDecision`

Called after every consensus deliberation, including allowed actions.

```typescript
consensus.wrap(executor, {
  onDecision: (result) => {
    auditLog.write({
      action: result.action,
      score: result.aggregateScore,
      rationale: result.scores.map((s) => s.rationale),
    });
  },
});
```

### `onError`

Called when an unexpected error occurs during deliberation (not a block — a runtime failure).

```typescript
consensus.wrap(executor, {
  onError: (err, context) => {
    Sentry.captureException(err, { extra: context });
  },
});
```

---

## Guard Domains

The seven built-in guard domains correspond to the guard packages in this monorepo.

| Domain | Description |
|---|---|
| `agent_action` | Pre-execution governance for autonomous agent actions (default) |
| `send_email` | Email automation governance — flags mass sends, PII in bodies |
| `code_merge` | PR / branch merge governance — flags sensitive file changes |
| `publish` | Content publishing governance — flags unreviewed or regulated content |
| `support_reply` | Customer support reply governance — flags tone, policy, escalation |
| `deployment` | Release deployment governance — flags prod, rollback risk |
| `permission_escalation` | IAM / privilege escalation governance — flags scope creep |

---

## Error Reference

| Error class | When thrown |
|---|---|
| `ConsensusBlockedError` | Deliberation blocked the action and `failPolicy` is `"closed"` |
| `MissingDependencyError` | Optional peer dependency not installed (langchain / ai-sdk / mcp) |
| `ConfigError` | Invalid `policy` string passed to `policyToStrategy` |

```typescript
import { ConsensusBlockedError, MissingDependencyError } from "@consensus-tools/universal";

try {
  const result = await safe("permission_escalation", { scope: "admin" });
} catch (err) {
  if (err instanceof ConsensusBlockedError) {
    // Deliberation blocked this call — log and surface to operator
    console.error("Blocked:", err.message);
  }
}
```

---

## OWASP Agentic Top 10 Mapping

The table below maps each guard domain to the OWASP Agentic AI Security Initiative Top 10 categories it addresses.

| # | OWASP Category | Addressed by guard domain(s) |
|---|---|---|
| 1 | **Excessive Agency** | `agent_action`, `permission_escalation` |
| 2 | **Tool Misuse** | `agent_action`, `code_merge`, `deployment` |
| 3 | **Prompt Injection** | `agent_action`, `support_reply` |
| 4 | **Insecure Outputs** | `publish`, `support_reply`, `send_email` |
| 5 | **Unauthorized Actions** | `permission_escalation`, `agent_action`, `deployment` |
| 6 | **Data Leakage** | `send_email`, `publish`, `support_reply` |
| 7 | **Supply Chain Attacks** | `code_merge`, `deployment` |
| 8 | **Denial of Wallet** | `send_email`, `agent_action` |
| 9 | **Unintended Autonomy** | `agent_action`, `permission_escalation` |
| 10 | **Trust Boundary Violations** | `permission_escalation`, `code_merge`, `deployment` |

### What happens at runtime

When you call a wrapped tool executor, here's the exact sequence:

```
safe("send_email", { to: "user@example.com", body: "Your invoice" })
  │
  ├─ 1. Serialize args to text
  │
  ├─ 2. Run 3 reviewers IN PARALLEL (rule-based, no LLM calls):
  │     ├─ security:    regex scan for destructive ops, secrets, injection
  │     ├─ compliance:  regex scan for SSN patterns, PII, email addresses
  │     └─ user-impact: regex scan for mass ops, irreversible actions
  │
  ├─ 3. Each reviewer returns: { vote: YES|NO|REWRITE, risk: 0-1, reason }
  │
  ├─ 4. Aggregate scores via policy (majority/supermajority/unanimous/threshold)
  │     └─ Any reviewer can hard-block regardless of policy
  │
  ├─ 5. Decision: allow | block | retry | escalate
  │
  ├─ 6. Write audit artifact (to memory or configured storage)
  │
  └─ 7. Return result or throw ConsensusBlockedError
```

**Latency:** Sub-millisecond. Reviewers are synchronous regex evaluators, not LLM calls. The only async operation is the audit artifact write. Target: <10ms total overhead for the default 3-reviewer configuration.

**DecisionResult object:**

```typescript
{
  action: "allow",           // "allow" | "block" | "retry" | "escalate"
  output: { ... },           // return value from the tool executor
  scores: [
    { score: 0.9, rationale: "No security concerns", block: false },
    { score: 0.5, rationale: "Email PII detected", block: false },
    { score: 0.9, rationale: "Low user impact", block: false },
  ],
  aggregateScore: 0.77,      // weighted average across reviewers
  attempt: 1,                // retry count
}
```

**Cost:** Zero. No API calls, no tokens consumed. The governance layer is pure computation.

---

## Exports

| Export | Kind | Description |
|---|---|---|
| `consensus` | Object | Main facade with `.wrap()`, `.langchain()`, `.aiSdk()`, `.mcp()` |
| `resolveWrappable` | Function | Resolves a `Wrappable` to a plain `ToolExecutor` |
| `policyToStrategy` | Function | Maps a policy name string to a `StrategyConfig` |
| `createLogger` | Function | Creates structured lifecycle log hooks |
| `DEFAULTS` | Const | Default config values |
| `DEFAULT_GUARD` | Const | `"agent_action"` |
| `DEFAULT_POLICY` | Const | `"majority"` |
| `DEFAULT_PERSONA_TRIO` | Const | `["security", "compliance", "user-impact"]` |
| `DEFAULT_PERSONA_COUNT` | Const | `3` |
| `ConsensusBlockedError` | Class | Thrown when deliberation blocks and `failPolicy` is `"closed"` |
| `MissingDependencyError` | Class | Thrown when an optional peer dep is not installed |
| `ConfigError` | Class | Thrown for invalid configuration (e.g., unknown policy name) |
| `Wrappable` | Type | `ToolExecutor \| { execute } \| { invoke } \| { call }` |
| `ToolExecutor` | Type | `(toolName: string, args: Record<string, unknown>) => Promise<unknown>` |
| `UniversalConfig` | Type | Full configuration interface |
| `FailPolicy` | Type | `"closed" \| "open"` |
| `LogEvent` | Type | `{ event: string; data: Record<string, unknown>; timestamp: number }` |

---

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)

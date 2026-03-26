# @consensus-tools/universal

Universal facade — wrap any tool executor with consensus governance in one line.

Three built-in reviewers (security, compliance, user-impact) deliberate before every tool call. Block, allow, or escalate based on a configurable policy. Adapters for LangChain, Vercel AI SDK, and MCP are loaded on demand.

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

### How each guard maps

**send_email** — prevents bulk/unauthorized sends (Insecure Outputs, Data Leakage, Denial of Wallet). The compliance reviewer flags email PII; the user-impact reviewer flags mass-broadcast operations.

**code_merge** — prevents unauthorized merges of sensitive files (Tool Misuse, Supply Chain Attacks, Trust Boundary Violations). The security reviewer flags destructive patterns; the compliance reviewer flags regulated file paths.

**publish** — prevents unreviewed or policy-violating content reaching users (Insecure Outputs, Data Leakage). All three reviewers apply.

**support_reply** — prevents prompt-injected or tone-violating customer replies (Prompt Injection, Insecure Outputs, Data Leakage). The compliance reviewer flags PII in reply bodies.

**agent_action** (default) — the broadest domain, covering autonomous actions of any kind (Excessive Agency, Tool Misuse, Prompt Injection, Unauthorized Actions, Denial of Wallet, Unintended Autonomy). All three built-in reviewers deliberate on every call.

**deployment** — prevents unauthorized releases to production environments (Tool Misuse, Unauthorized Actions, Supply Chain Attacks, Trust Boundary Violations). The security reviewer hard-blocks destructive deploy patterns.

**permission_escalation** — prevents IAM scope creep and privilege abuse (Excessive Agency, Unauthorized Actions, Unintended Autonomy, Trust Boundary Violations). The security reviewer hard-blocks admin-scope operations; the compliance reviewer flags regulated roles.

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

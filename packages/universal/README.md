# @consensus-tools/universal

**Single-model AI pipelines are a reliability failure.** One model, one prompt, one answer — no accountability. When an autonomous agent decides to send an email, merge code, or escalate permissions, nothing checks whether that's a good idea.

`@consensus-tools/universal` adds a governance layer in one line. Two operating modes:

- **Regex mode** (default): Three rule-based reviewers (security, compliance, user-impact) review tool output using pattern matching — no LLM calls, no network requests, sub-millisecond review overhead. The tool executes first, then reviewers evaluate.
- **LLM Persona mode** (activated when `config.model` is provided): Multiple AI personas deliberate on each tool call BEFORE execution, with reputation-weighted voting, automatic persona respawn, and risk-tier classification.

Both modes support the same `consensus.wrap()` API. Block, allow, or escalate based on a configurable policy. Adapters for LangChain, Vercel AI SDK, and MCP are loaded on demand.

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

### Regex Mode — any tool executor

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

### LLM Persona Mode — multi-model deliberation

Provide a `model` adapter to activate LLM Persona Mode. Multiple AI personas deliberate on each tool call with reputation tracking and automatic respawn.

```typescript
import { consensus } from "@consensus-tools/universal";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Provider-agnostic model adapter — accepts messages, returns text
// Note: ModelAdapter receives { role: "system" | "user" } messages.
// The Anthropic SDK uses a separate `system` param, so extract it here.
const model = async (messages) => {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const userMsgs = messages.filter((m) => m.role === "user").map((m) => ({ role: "user" as const, content: m.content }));
  const res = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system,
    messages: userMsgs,
  });
  return res.content[0].text;
};

const safe = consensus.wrap(myExecutor, {
  model,                          // activates LLM mode
  policy: "weighted_reputation",  // any of 9 core policies
  pack: "governance",             // persona pack (default: "default")
  mode: "enforce",                // "enforce" (default) or "shadow"
});

const result = await safe("deploy_to_prod", { service: "api", version: "2.1.0" });
```

**Shadow mode** logs every decision but never blocks — useful for evaluating governance before enforcing it:

```typescript
const safe = consensus.wrap(myExecutor, {
  model,
  mode: "shadow",
  onDecision: (decision) => metrics.track("consensus", decision),
});
```

---

### langchain — LangChain callback handler

```typescript
import { consensus } from "@consensus-tools/universal";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor } from "langchain/agents";

const model = new ChatOpenAI({ model: "gpt-4o" });

// Returns a ConsensusGuardCallbackHandler — attach it to your chain's callbacks
const handler = await consensus.langchain(null, {
  policy: "supermajority",
  failPolicy: "closed",
});

const executor = AgentExecutor.fromAgentAndTools({ agent, tools, callbacks: [handler] });
```

Requires `@consensus-tools/langchain` as a peer dependency. The first argument is unused (retained for API compatibility).

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
  guards: ["security", "compliance"],
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

## Risk Tiers (LLM Mode)

In LLM mode, tools are classified by name into risk tiers. Low-risk tools fast-path through regex only (no LLM call). High-risk tools get full persona deliberation.

| Tier | Patterns | Examples |
|---|---|---|
| **High** (full deliberation) | `send/email/mail`, `delete/remove/drop/destroy`, `write/update/patch/put/post/create/insert`, `deploy/release/publish/push`, `merge/commit/approve`, `grant/revoke/escalate/permission`, `execute/run/eval/exec`, `transfer/pay/charge/refund` | `send_email`, `delete_user`, `deploy_to_prod` |
| **Low** (regex fast-path) | `get/fetch/read/list/search/query/find/lookup`, `check/verify/validate/inspect/describe`, `count/sum/aggregate/stats`, `view/show/display/render/preview` | `get_user`, `list_orders`, `search_docs` |
| **Unknown** | No pattern match | Defaults to **high** (safe by default) |

High-risk patterns are checked **before** low-risk patterns, but all patterns are prefix-anchored (`^`). A tool named `get_and_delete_user` matches the low-risk `get` prefix, not the high-risk `delete`. Use `riskTiers` overrides for compound names that start with read-like prefixes but perform writes.

Override per tool:

```typescript
const safe = consensus.wrap(myExecutor, {
  model,
  riskTiers: {
    "my_safe_tool": "low",     // skip LLM deliberation
    "my_risky_read": "high",   // force full deliberation
  },
});
```

---

## Persona Packs (LLM Mode)

Persona packs define which AI reviewers participate in deliberation.

| Pack | Personas | Use case |
|---|---|---|
| `"default"` | security, compliance, operations | General-purpose agent governance |
| `"governance"` | 5 lifecycle specialists | Structured organizational oversight |

Override with custom personas:

```typescript
import type { PersonaConfig } from "@consensus-tools/personas";

const safe = consensus.wrap(myExecutor, {
  model,
  personas: [
    { id: "sec", name: "Security Analyst", role: "Focus on injection, data exfiltration..." },
    { id: "ops", name: "Ops Lead", role: "Focus on blast radius, rollback..." },
  ],
});
```

---

## Reputation & Respawn (LLM Mode)

Each persona's vote accuracy is tracked over time. When a persona's reputation drops below the respawn threshold (default: `0.15`), it is automatically replaced with a successor that inherits the original's failure modes.

```typescript
const safe = consensus.wrap(myExecutor, {
  model,
  reputationStore: myStorage,   // persist reputation across restarts
  respawnThreshold: 0.2,        // trigger respawn below this score
  onFeedback: (signal) => auditLog.write(signal),
});

// After a human reviews a decision, send feedback to update reputation
safe.feedback({ decisionId: "dec_abc123", type: "override_block" });
```

Reputation events are emitted via the logger:

```typescript
// { event: "persona.respawned", data: { oldPersonaId, newPersonaId, reputation, reason } }
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      @consensus-tools/universal                      │
│                                                                      │
│   consensus.wrap()   consensus.langchain()  consensus.aiSdk()        │
│   consensus.mcp()                                                    │
└───────────────┬──────────────────────────────┬───────────────────────┘
                │ resolves Wrappable → ToolExecutor
       config.model?                           │
      ┌─── no ──┴──── yes ───┐                 │
      ▼                       ▼                 │
┌──────────────────┐  ┌───────────────────────┐ │
│   REGEX MODE     │  │   LLM PERSONA MODE    │ │
│                  │  │                       │ │
│  @ct/wrapper     │  │  deliberate()         │ │
│  + GuardTemplate │  │  + ReputationManager  │ │
│  reviewers       │  │  + classifyTool()     │ │
│                  │  │  + resolveConsensus() │ │
└────────┬─────────┘  └──────────┬────────────┘ │
         │                       │              │
         ▼                       ▼              │
  3 regex reviewers      N persona LLM calls    │
  (sub-ms, sync)        (per-persona timeout    │
                         → regex fallback, NO)   │
         │                       │              │
         └───────────┬───────────┘              │
                     ▼                          │
          action: allow | block | escalate      │
          + audit artifact write                │

┌─────────────────────────────────────────────────────────────────────┐
│                   Configurable Guard Domains                         │
│   send_email  code_merge  publish  support_reply                     │
│   agent_action  deployment  permission_escalation                    │
│                   @consensus-tools/guards (Tier 1)                   │
└─────────────────────────────────────────────────────────────────────┘

Tier layout (consensus-tools layered architecture):
  Tier 0  schemas, secrets
  Tier 1  guards, telemetry, evals, integrations, notifications, personas
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

### `consensus.langchain(_chain, config?)`

Returns a `ConsensusGuardCallbackHandler` for LangChain. Dynamically imports `@consensus-tools/langchain`. The first argument is unused (attach the returned handler to your chain's `callbacks` array).

```typescript
async function langchain(_chain: unknown, config?: Partial<UniversalConfig>): Promise<unknown>
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
  // ── Shared (both modes) ─────────────────────────────────────────────
  policy?:     string;                              // "majority"
  guards?:     string[];                            // ["agent_action"]
  failPolicy?: "closed" | "open";                  // "closed"
  storage?:    "memory" | IStorage;                // "memory"
  logger?:     boolean | ((event: LogEvent) => void); // true
  onDecision?: (decision: DecisionResult<unknown> | LlmDecisionResult) => void;
  onError?:    (err: Error, action: unknown) => void;

  // ── LLM Persona Mode (activated when `model` is provided) ──────────
  model?:            ModelAdapter;                  // undefined (regex mode)
  pack?:             string;                        // "default"
  personas?:         PersonaConfig[];               // overrides pack
  mode?:             ExecutionMode;                 // "enforce"
  riskTiers?:        RiskTierMap;                   // per-tool overrides
  onFeedback?:       (signal: FeedbackSignal) => void;
  reputationStore?:  IStorage;                      // persist reputation
  respawnThreshold?: number;                        // 0.15
  personaTimeout?:   number;                        // 3000 (ms)
}
```

### `policy`

Maps to an aggregation strategy for reviewers.

| Value | Mode | Strategy |
|---|---|---|
| `"majority"` (default) | Both | More than half of reviewers approve. Regex: threshold strategy. LLM: net positive vote score. |
| `"supermajority"` | Both | Regex: threshold >= 0.67. LLM: APPROVAL_VOTE with minScore requiring >= 67% approval. |
| `"unanimous"` | Both | Regex: all must approve. LLM: APPROVAL_VOTE with minScore requiring all YES votes. |
| `"threshold:X"` | Both | Weighted average score >= X (0–1) |
| `"weighted_reputation"` | LLM only | Votes weighted by persona reputation score (alias for `WEIGHTED_REPUTATION`) |
| `"first_wins"` | LLM only | First persona's vote wins (alias for `FIRST_SUBMISSION_WINS`) |
| `"highest_confidence"` | LLM only | Highest confidence vote wins (alias for `HIGHEST_CONFIDENCE_SINGLE`) |
| `"top_k"` | LLM only | Top-K scoring split (alias for `TOP_K_SPLIT`) |
| `"owner_pick"` | LLM only | Designated owner persona decides (alias for `OWNER_PICK`) |
| `"arbiter"` | LLM only | Trusted arbiter persona decides (alias for `TRUSTED_ARBITER`) |
| `"MAJORITY_VOTE"` | LLM only | Direct majority vote count |
| `"WEIGHTED_REPUTATION"` | LLM only | Reputation-weighted vote scoring |
| `"WEIGHTED_VOTE_SIMPLE"` | LLM only | Explicit vote weight scoring |
| `"APPROVAL_VOTE"` | LLM only | Approval threshold-based voting |
| `"FIRST_SUBMISSION_WINS"` | LLM only | First persona's vote wins |
| `"HIGHEST_CONFIDENCE_SINGLE"` | LLM only | Highest confidence vote wins |
| `"OWNER_PICK"` | LLM only | Designated owner persona decides |
| `"TOP_K_SPLIT"` | LLM only | Top-K scoring split |
| `"TRUSTED_ARBITER"` | LLM only | Trusted arbiter persona decides |

Using an LLM-only policy without providing `model` emits a warning and falls back to `majority`.

### `guards`

Guard domain names to use as reviewers. Defaults to `["agent_action"]`. When the default is used, the actual reviewers are `security`, `compliance`, and `user-impact` (the three domains with implemented rule sets). Custom domain names are accepted but fall back to a permissive placeholder.

### `failPolicy`

| Value | Behavior on deliberation error or block |
|---|---|
| `"closed"` (default) | Throw `ConsensusBlockedError` — the tool call does not execute |
| `"open"` | Allow the tool call to proceed despite the deliberation result |

**`failPolicy: "open"` disables enforcement.** Governance still runs (decisions are made, `onDecision` fires), but blocked actions execute anyway. It exists for development and testing only. In production, use `"closed"` (the default) and handle `ConsensusBlockedError` in your error path.

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
    // Regex mode: result has `scores` array
    // LLM mode: result has `votes` array and `decisionId`
    auditLog.write({
      action: result.action,
      score: result.aggregateScore,
    });
  },
});
```

### `onError`

Called when an unexpected error occurs during deliberation, audit writes, or callbacks. In LLM mode, the `context` object may include a `phase` field: `"onDecision"` (callback error) or `"audit_write"` (storage error). General deliberation errors have no `phase` field. In regex mode, context contains `{ toolName, args }`.

```typescript
consensus.wrap(executor, {
  onError: (err, context) => {
    Sentry.captureException(err, { extra: context });
  },
});
```

---

### `model` (LLM mode)

Provider-agnostic model adapter. Accepts `ModelMessage[]`, returns raw text. When provided, activates LLM Persona Mode.

```typescript
type ModelMessage = { role: "system" | "user"; content: string };
type ModelAdapter = (messages: ModelMessage[]) => Promise<string>;
```

```typescript
// OpenAI
const model = async (msgs) => {
  const res = await openai.chat.completions.create({ model: "gpt-4o", messages: msgs });
  return res.choices[0].message.content;
};

// Anthropic (system messages go in separate param)
const model = async (msgs) => {
  const system = msgs.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const messages = msgs.filter((m) => m.role === "user").map((m) => ({ role: "user" as const, content: m.content }));
  const res = await anthropic.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 512, system, messages });
  return res.content[0].text;
};
```

### `mode` (LLM mode)

| Value | Behavior |
|---|---|
| `"enforce"` (default) | Blocks tool execution when consensus rejects |
| `"shadow"` | Logs every decision but never blocks — always executes the tool |

Shadow mode is useful for evaluating governance accuracy before enabling enforcement. `onDecision` still fires in shadow mode.

### `personaTimeout` (LLM mode)

Per-persona LLM call timeout in milliseconds. Default: `3000`. When a persona times out, it falls back to regex evaluation (fail-closed — regex fallback votes `NO` by default).

### `onFeedback` (LLM mode)

Notification hook fired after `.feedback()` processes a signal. Use it to log or react to reputation updates.

### `.feedback(signal)` (LLM mode)

In LLM mode, `consensus.wrap()` returns an augmented executor with a `.feedback()` method for sending human feedback to the reputation system.

```typescript
const safe = consensus.wrap(myExecutor, { model, logger: false });

// After observing a bad block, send feedback
safe.feedback({ decisionId: "dec_abc123", type: "override_block" });

// After observing a missed risk, send feedback
safe.feedback({ decisionId: "dec_xyz789", type: "flag_miss" });
```

Wire `onFeedback` for logging:

```typescript
const safe = consensus.wrap(myExecutor, {
  model,
  onFeedback: (signal) => {
    console.log("Reputation updated for decision:", signal.decisionId);
  },
});
```

The `.feedback()` method is only available in LLM mode. In regex mode, the returned executor is a plain `ToolExecutor`.

---

## Guard Domains

Three guard domains have implemented rule sets with regex pattern matching:

| Domain | Description |
|---|---|
| `security` | Flags destructive operations (`delete`, `rm -rf`), secret exposure, injection risks |
| `compliance` | Flags SSN patterns, PII (email addresses), regulated data |
| `user-impact` | Flags mass operations (`broadcast`, `mass_delete`), irreversible actions |

These are the default reviewers in regex mode. The `guards` config accepts any string, but unrecognized domains fall back to a permissive placeholder (always votes YES, risk 0.1).

The broader consensus-tools monorepo defines seven guard categories (`agent_action`, `send_email`, `code_merge`, `publish`, `support_reply`, `deployment`, `permission_escalation`) as standalone guard packages. These are separate from the universal package's built-in regex reviewers.

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

The table below maps the consensus-tools monorepo's guard domains to OWASP Agentic AI categories. The universal package's built-in regex reviewers (`security`, `compliance`, `user-impact`) cover categories 1, 3, 4, 6, 8, and 9. The full set of 7 domains is available via the standalone guard packages.

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

#### Regex mode

```
safe("send_email", { to: "user@example.com", body: "Your invoice" })
  │
  ├─ 1. Execute the tool function (the call runs first)
  │
  ├─ 2. Review the output with 3 reviewers IN PARALLEL (rule-based, no LLM calls):
  │     ├─ security:    regex scan for destructive ops, secrets, injection
  │     ├─ compliance:  regex scan for SSN patterns, PII, email addresses
  │     └─ user-impact: regex scan for mass ops, irreversible actions
  │
  ├─ 3. Each reviewer returns: { score: 0-1, rationale: string, block?: boolean }
  │
  ├─ 4. Aggregate scores via policy (majority/supermajority/unanimous/threshold)
  │     └─ Any reviewer can hard-block (block: true) regardless of policy
  │
  ├─ 5. Decision: allow | block | retry | escalate
  │
  ├─ 6. Write audit artifact (to memory or configured storage)
  │
  └─ 7. Return output or throw ConsensusBlockedError
```

> **Note:** In regex mode, the tool executes BEFORE reviewers run. Reviewers evaluate the output, not the input. If blocked, the output is discarded but the side effect already occurred. For pre-execution governance (input screening before the tool runs), use LLM Persona Mode.

**Latency:** Sub-millisecond for the review phase. Reviewers are synchronous regex evaluators. Total overhead includes tool execution time.

**Cost:** Zero for the governance layer. No API calls, no tokens consumed.

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
  aggregateScore: 0.77,      // arithmetic mean across reviewers
  attempt: 1,                // retry count
}
```

#### LLM Persona mode

```
safe("deploy_to_prod", { service: "api", version: "2.1.0" })
  │
  ├─ 1. Await reputation load (first call only, if reputationStore configured)
  │
  ├─ 2. Regex pre-screen (sub-ms, same as regex mode)
  │
  ├─ 3. Classify tool risk tier:
  │     ├─ Low-risk ("get_user") → fast-path regex only, skip LLM
  │     └─ High-risk ("deploy_to_prod") → continue to LLM deliberation
  │
  ├─ 4. Call N personas IN PARALLEL (with per-persona timeout):
  │     ├─ Each persona receives: system prompt + tool name + args (truncated to 2000 chars)
  │     ├─ Each returns: VOTE: YES|NO|REWRITE, CONFIDENCE: 0-1, rationale
  │     └─ On timeout/parse failure → regex fallback (fail-closed, votes NO)
  │
  ├─ 5. Synthesize votes into ConsensusInput (single submission, N votes)
  │     └─ YES → +1, NO → -1, REWRITE → 0
  │
  ├─ 6. Resolve consensus via policy (resolveConsensus)
  │     └─ APPROVAL_VOTE: threshold check (empty winners → block)
  │     └─ MAJORITY/WEIGHTED: score-based (positive → allow)
  │     └─ Rewrite majority → escalate
  │
  ├─ 7. Record decision for feedback correlation (capped at 500 entries)
  │
  ├─ 8. Write audit entry to storage
  │
  ├─ 9. Fire onDecision callback (errors routed to onError, never affect decision)
  │
  └─ 10. enforce mode → block/throw | shadow mode → always execute
```

**Latency:** Depends on model latency. Timeout per persona defaults to 3000ms. Low-risk tools bypass LLM entirely.

**Cost:** N model calls per high-risk tool invocation (where N = number of personas, default 3).

**LlmDecisionResult object:**

```typescript
{
  decisionId: "a1b2c3d4-...",    // unique ID for feedback correlation
  action: "allow",                // "allow" | "block" | "escalate"
  votes: [
    {
      personaId: "sec",
      personaName: "Security Analyst",
      vote: "YES",
      confidence: 0.85,
      rationale: "No injection patterns detected",
      source: "llm",              // "llm" or "regex_fallback"
    },
    // ...
  ],
  policy: "WEIGHTED_REPUTATION",
  consensusTrace: { ... },        // full trace from resolveConsensus
  aggregateScore: 0.82,
}
```

---

## Exports

| Export | Kind | Description |
|---|---|---|
| `consensus` | Object | Main facade with `.wrap()`, `.langchain()`, `.aiSdk()`, `.mcp()` |
| `resolveWrappable` | Function | Resolves a `Wrappable` to a plain `ToolExecutor` |
| `policyToStrategy` | Function | Maps a policy name string to a `StrategyConfig` (regex mode) |
| `resolvePolicyType` | Function | Maps a policy string to a core policy type name (LLM mode) |
| `createLogger` | Function | Creates structured lifecycle log hooks |
| `ReputationManager` | Class | Per-persona reputation tracking with respawn (LLM mode) |
| `classifyTool` | Function | Classifies a tool name into a risk tier (LLM mode) |
| `deliberate` | Function | LLM persona deliberation engine (LLM mode) |
| `DEFAULTS` | Const | Default config values |
| `DEFAULT_GUARD` | Const | `"agent_action"` |
| `DEFAULT_POLICY` | Const | `"majority"` |
| `DEFAULT_PERSONA_TRIO` | Const | `["security", "compliance", "user-impact"]` |
| `DEFAULT_PERSONA_COUNT` | Const | `3` |
| `DEFAULT_PACK` | Const | `"default"` |
| `ConsensusBlockedError` | Class | Thrown when deliberation blocks and `failPolicy` is `"closed"` |
| `MissingDependencyError` | Class | Thrown when an optional peer dep is not installed |
| `ConfigError` | Class | Thrown for invalid configuration (e.g., unknown policy name) |
| `AugmentedExecutor` | Type | `ToolExecutor & { feedback(signal: FeedbackSignal): void }` |
| `Wrappable` | Type | `ToolExecutor \| { execute } \| { invoke } \| { call }` |
| `ToolExecutor` | Type | `(toolName: string, args: Record<string, unknown>) => Promise<unknown>` |
| `UniversalConfig` | Type | Full configuration interface |
| `ModelAdapter` | Type | `(messages: ModelMessage[]) => Promise<string>` |
| `ModelMessage` | Type | `{ role: "system" \| "user"; content: string }` |
| `LlmDecisionResult` | Type | Decision result from LLM persona deliberation |
| `FeedbackSignal` | Type | Human feedback signal for reputation updates |
| `ExecutionMode` | Type | `"enforce" \| "shadow"` |
| `FailPolicy` | Type | `"closed" \| "open"` |
| `RiskTier` | Type | `"low" \| "high"` |
| `RiskTierMap` | Type | `Record<string, RiskTier>` |
| `LogEvent` | Type | `{ event: string; data: Record<string, unknown>; timestamp: number }` |

---

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/toolkit)

# consensus-tools

**One model guessing is cheap. Multiple agents earning consensus is reliable.**

Decision infrastructure for agentic systems. Agents submit, vote, stake, and earn trust — or get slashed.

[![CI](https://github.com/consensus-tools/consensus-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/consensus-tools/consensus-tools/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@consensus-tools/core?label=npm)](https://www.npmjs.com/package/@consensus-tools/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

## Agents with skin in the game

Most agent systems fail the same way: one model, one prompt, one answer, no accountability. `consensus-tools` replaces that with structured coordination where every decision is earned, not assumed.

- **Economic incentives** — Agents stake tokens to claim jobs. Winners earn rewards. Bad actors get slashed. A deterministic ledger tracks every balance change.
- **Multi-agent consensus** — 9 pluggable policies from speed-first to reputation-weighted voting. Same inputs, same resolution, every time.
- **Guard system** — 7 built-in guard types (`send_email`, `code_merge`, `publish`, `support_reply`, `agent_action`, `deployment`, `permission_escalation`) with risk scoring and four possible decisions: `ALLOW`, `BLOCK`, `REWRITE`, `REQUIRE_HUMAN`.
- **Human-in-the-loop** — Timeout-aware, storage-backed approvals dispatched via Slack, Teams, Discord, Telegram, or webhooks. Survives restarts.
- **Full audit trail** — Every vote, every risk score, every consensus trace. Observable by default.

## Quick Start

### Consensus in 10 lines

```typescript
import { LocalBoard } from "@consensus-tools/core";

const board = new LocalBoard({
  mode: "local",
  local: {
    storage: { kind: "json", path: "./board.json" },
    jobDefaults: { reward: 10, stakeRequired: 1, maxParticipants: 5, expiresSeconds: 3600, consensusPolicy: { type: "HIGHEST_CONFIDENCE_SINGLE" } },
  },
});
await board.init();

const job = await board.engine.postJob("coordinator", { title: "Toxicity check", reward: 20, stakeRequired: 5 });
await board.engine.claimJob("agent-1", job.id, { stakeAmount: 5, leaseSeconds: 300 });
await board.engine.submitJob("agent-1", job.id, { summary: "Not toxic", confidence: 0.92, artifacts: { toxic: false } });
const resolution = await board.engine.resolveJob("coordinator", job.id);
// resolution.winners → ["agent-1"]
```

### Guard any tool executor in 3 lines

```typescript
import { consensus } from "@consensus-tools/universal";

// Wrap any (toolName, args) => Promise function with consensus governance
const safeTool = consensus.wrap(async (toolName, args) => callTool(toolName, args));
const result = await safeTool("send_email", { to: "user@example.com", body: "Hello" });
// Each invocation is screened by 3 rule-based reviewers (security, compliance, user-impact)
// Decisions are stored in memory by default — pass `storage` option for persistence
```

### Guard a function call (direct wrapper)

```typescript
import { consensus } from "@consensus-tools/wrapper";

const safeSend = consensus(sendEmail, {
  reviewers: [humanReviewer, aiSafetyReviewer],
  strategy: { mode: "unanimous" },
  hooks: { onBlock: (ctx) => audit.log("blocked", ctx) },
});

await safeSend({ to: "user@example.com", body: "Hello" });
```

## What you can build

**PR merge guard** — 3 AI reviewer personas evaluate code changes. The guard engine scores risk, checks quorum, and decides `ALLOW`/`BLOCK`/`REWRITE`. High-risk merges escalate to a human approver via Slack. Built-in template: `prMergeGuardTemplate`.

**Content moderation firewall** — Wrap any `publish()` function with a consensus gate. Profanity scanning, PII detection, and blocked-word lists run as deterministic evaluators. Escalate to human review when risk exceeds your threshold.

**Task decomposition pipeline** — Fetch a Linear task, decompose it into subtasks via multi-agent consensus on the decomposition quality, then auto-create subtasks in Linear. Built-in template: `linearTaskDecompTemplate`.

**Cron auto-assignment** — Periodically fetch unassigned work items, skill-match and load-balance via multi-agent voting, then assign via platform API. Built-in template: `cronAutoAssignTemplate`.

## Consensus Policies

9 built-in policies cover common resolution patterns:

| Policy | Best for |
|--------|----------|
| `FIRST_SUBMISSION_WINS` | Speedrun tasks, first-correct workflows |
| `HIGHEST_CONFIDENCE_SINGLE` | Safety-sensitive decisions where false positives are expensive |
| `APPROVAL_VOTE` | Weighted voting with quorum and settlement modes (immediate, staked, oracle) |
| `OWNER_PICK` | Subjective or creative tasks requiring human judgment |
| `TRUSTED_ARBITER` | High-stakes workflows requiring manual adjudication |
| `TOP_K_SPLIT` | Rewarding multiple top submissions |
| `MAJORITY_VOTE` | Simple majority classification |
| `WEIGHTED_VOTE_SIMPLE` | Explicitly weighted voting |
| `WEIGHTED_REPUTATION` | Reputation-based vote weighting |

All policies are pure functions. Same inputs, same resolution, every time.

## Architecture

```
Agent A ----\
Agent B -----\            ┌─────────────┐
Agent C ------> Guards -->│ Consensus   │
Human -------/            │ Policies    │
                         └──────┬──────┘
                                │
                          Final Decision
                                │
                         Function Executes
```

```
Tier 0 — Foundation        schemas    secrets
Tier 1 — Primitives        guards    telemetry    evals    integrations    notifications    sdk-client
Tier 2 — Engines           core      policies
Tier 3 — Composition       workflows    wrapper
Tier 4 — Adapters & Apps   universal    sdk-node    mcp    openclaw    cli    local-board    dashboard
```

Dependencies flow downward only. `schemas` has zero internal dependencies. Everything else composes these primitives. Enforced by CI via `pnpm dep-check`.

## Packages

### Foundation

| Package | Description |
|---------|-------------|
| [`@consensus-tools/schemas`](packages/schemas) | Zod schemas and TypeScript types — the contract layer every package depends on |
| [`@consensus-tools/secrets`](packages/adapters/secrets) | AES-256-GCM credential encryption and storage |

### Primitives

| Package | Description |
|---------|-------------|
| [`@consensus-tools/guards`](packages/guards) | 7 guard types with three-step weighted decision model: risk threshold, quorum check, final verdict |
| [`@consensus-tools/telemetry`](packages/telemetry) | Traces, events, and buffered sinks for observability |
| [`@consensus-tools/evals`](packages/evals) | Multi-agent evaluation — LLM persona guard evaluation, A/B consensus eval with reputation-weighted scoring, and score validation |
| [`@consensus-tools/integrations`](packages/adapters/integrations) | External platform adapters for GitHub and Linear |
| [`@consensus-tools/notifications`](packages/adapters/notifications) | Approval prompts and timeout warnings via Slack, Teams, Discord, Telegram, webhooks |
| [`@consensus-tools/sdk-client`](packages/sdk-client) | HTTP client for remote board API |
| [`@consensus-tools/storage`](packages/storage) | Storage backends — JSON file, SQLite, and in-memory for dev/test |
| [`@consensus-tools/personas`](packages/personas) | Persona lifecycle: packs, reputation engine, respawn logic |
| [`@consensus-tools/langchain`](packages/adapters/langchain) | LangChain adapter — guards as DynamicStructuredTools with callback handler |
| [`@consensus-tools/ai-sdk`](packages/adapters/ai-sdk) | Vercel AI SDK adapter — guarded generate and stream middleware |

### Engines

| Package | Description |
|---------|-------------|
| [`@consensus-tools/core`](packages/core) | Job engine, deterministic ledger, guard engine, agent registry — the protocol runtime |
| [`@consensus-tools/policies`](packages/policies) | 9 consensus policy implementations + pluggable registry |

### Composition

| Package | Description |
|---------|-------------|
| [`@consensus-tools/workflows`](packages/workflows) | DAG-based workflow engine with checkpoint execution, HITL pause/resume, cron scheduling |
| [`@consensus-tools/wrapper`](packages/wrapper) | Runtime decision firewall — wraps any function with consensus gates |

### Adapters & Universal

| Package | Description |
|---------|-------------|
| [`@consensus-tools/universal`](packages/universal) | Drop-in governance for Node.js/TypeScript tool executors — 3-line integration with optional adapters for LangChain, AI SDK, and MCP |
| [`@consensus-tools/sdk-node`](packages/sdk-node) | Node.js HTTP server with REST API, webhooks, guard evaluation, and workflow execution |
| [`@consensus-tools/mcp`](packages/adapters/mcp) | 29 MCP tools exposing the full consensus protocol to any LLM agent |
| [`@consensus-tools/openclaw`](packages/adapters/openclaw) | OpenClaw plugin adapter |
| [`@consensus-tools/cli`](packages/cli) | CLI for managing jobs, agents, and traces |

## Apps

| App | Description |
|-----|-------------|
| [`local-board`](apps/local-board) | Standalone API server bundling core + policies + workflows + guards on port 9888 |
| [`dashboard`](apps/dashboard) | React + Vite web dashboard with workflow builder, audit timeline, and agent management |

## Examples

| Example | Description |
|---------|-------------|
| [`next-api-route`](examples/next-api-route) | Using core in a Next.js API route |
| [`mcp-server`](examples/mcp-server) | MCP server for LLM agents |
| [`background-worker`](examples/background-worker) | Long-running worker polling for jobs |
| [`openclaw-plugin`](examples/openclaw-plugin) | OpenClaw plugin configuration |
| [`cs-demo`](examples/cs-demo) | Interactive customer service guard pipeline with HITL approval and reputation tracking |
| [`skill-guard-demo`](examples/skill-guard-demo) | Multi-agent SKILL.md authoring with diff guards, consensus eval, and reputation settlement |

## Getting Started

### Use as a library

```bash
# Simplest path — wrap any tool executor with consensus governance
pnpm add @consensus-tools/universal

# Full control — core protocol primitives for custom guards and policies
pnpm add @consensus-tools/core @consensus-tools/policies
```

### Run the full stack

```bash
git clone https://github.com/consensus-tools/consensus-tools.git
cd consensus-tools
pnpm install
pnpm build

# Start the API server (port 9888)
pnpm --filter @consensus-tools/local-board dev

# Start the dashboard (port 5000)
pnpm --filter @consensus-tools/dashboard dev
```

### Run tests

```bash
pnpm test
pnpm typecheck
```

## Design Principles

- **Local-first** — Everything runs on one machine by default. No network calls unless you opt in.
- **Deterministic** — Same inputs, same resolution. Pure policy functions, no hidden state.
- **Observable** — Every decision produces a trace with full consensus breakdown and risk scores.
- **Sharp boundaries** — Each package has a single responsibility with clean barrel exports.
- **Economic** — Stakes and slashing are first-class primitives, not an afterthought.

## Migration from v0.2.0

See [MIGRATION.md](MIGRATION.md) for upgrading from the monolithic `@consensus-tools/consensus-tools@0.2.0`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and contribution guidelines.

## License

[Apache License 2.0](LICENSE)

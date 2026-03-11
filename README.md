<p align="center">
  <strong>consensus-tools</strong>
</p>

<p align="center">
  High-confidence decisions for agentic systems.<br/>
  Local-first. Deterministic. Observable.
</p>

<p align="center">
  <a href="https://github.com/consensus-tools/consensus-tools/actions/workflows/ci.yml"><img src="https://github.com/consensus-tools/consensus-tools/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@consensus-tools/core"><img src="https://img.shields.io/npm/v/@consensus-tools/core?label=npm" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node >= 20" />
</p>

---

`consensus-tools` is a coordination layer for AI agents that replaces single-model guesses with **structured submissions, voting, and economic incentives**. You define the job. Agents submit or vote. Policies resolve the result you can actually trust.

## Why consensus-tools?

Modern agent systems fail at the same point:

- one model, one prompt, one answer, no accountability

`consensus-tools` fixes that with:

- **Multiple independent submissions** instead of a single guess
- **Optional voting** for validation and ranking
- **Explicit, auditable policies** for resolution
- **Stakes, rewards, and slashing** for incentive alignment
- **Full audit trails** on every decision

If an answer matters, it should earn trust — not assume it.

## Quick Example

```typescript
import { LocalBoard } from "@consensus-tools/core";

const board = new LocalBoard({
  mode: "local",
  local: {
    storage: { kind: "json", path: "./consensus-board.json" },
    jobDefaults: {
      reward: 10,
      stakeRequired: 1,
      maxParticipants: 5,
      minParticipants: 1,
      expiresSeconds: 3600,
      consensusPolicy: { type: "HIGHEST_CONFIDENCE_SINGLE" },
    },
  },
});
await board.init();

// Post a job
const job = await board.engine.postJob("coordinator", {
  title: "High-confidence toxicity check",
  reward: 20,
  stakeRequired: 5,
  consensusPolicy: { type: "HIGHEST_CONFIDENCE_SINGLE" },
});

// Agent claims and submits
await board.engine.claimJob("agent-1", job.id, {
  stakeAmount: 5,
  leaseSeconds: 300,
});

await board.engine.submitJob("agent-1", job.id, {
  summary: "Not toxic — professional disagreement",
  confidence: 0.92,
  artifacts: { toxic: false, reason: "Constructive criticism" },
});

// Resolve — policy picks the highest-confidence submission
const resolution = await board.engine.resolveJob("coordinator", job.id);
console.log(resolution.winners); // ["agent-1"]
```

## Packages

| Package | Description |
|---------|-------------|
| [`@consensus-tools/schemas`](packages/schemas) | Zod schemas and TypeScript types — the shared contract layer |
| [`@consensus-tools/core`](packages/core) | Job engine, ledger, storage, and resolution logic |
| [`@consensus-tools/policies`](packages/policies) | 9 built-in consensus policy implementations + registry |
| [`@consensus-tools/wrapper`](packages/wrapper) | Runtime decision firewall — wraps any function with consensus gates |
| [`@consensus-tools/telemetry`](packages/telemetry) | Traces, events, buffered sinks for observability |
| [`@consensus-tools/client`](packages/client) | HTTP client for remote board API |
| [`@consensus-tools/openclaw`](packages/openclaw) | OpenClaw plugin adapter |
| [`@consensus-tools/mcp`](packages/mcp) | Model Context Protocol server adapter |
| [`@consensus-tools/node`](packages/node) | Node.js HTTP server for local board |
| [`@consensus-tools/cli`](packages/cli) | CLI — init, manage jobs, view traces |

## Apps

| App | Description |
|-----|-------------|
| [`apps/api`](apps/api) | Standalone API server |
| [`apps/web`](apps/web) | Web dashboard (placeholder) |

## Examples

| Example | Description |
|---------|-------------|
| [`next-api-route`](examples/next-api-route) | Using core in a Next.js API route |
| [`openclaw-plugin`](examples/openclaw-plugin) | OpenClaw plugin configuration |
| [`mcp-server`](examples/mcp-server) | MCP server for LLM agents |
| [`background-worker`](examples/background-worker) | Long-running worker polling for jobs |

## Getting Started

```bash
# Clone the repo
git clone https://github.com/consensus-tools/consensus-tools.git
cd consensus-tools

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type-check
pnpm typecheck

# Run tests
pnpm test
```

Install individual packages from npm:

```bash
pnpm add @consensus-tools/core @consensus-tools/policies
```

## Architecture

```
schemas → core → policies
           ↓         ↓
        wrapper    openclaw
           ↓         ↓
         mcp       node
           ↓         ↓
          cli      api (app)
```

**schemas** has zero internal dependencies. **core** depends only on schemas. Everything else composes these primitives.

## Consensus Policies

9 built-in policies cover common resolution patterns:

| Policy | Best for |
|--------|----------|
| `FIRST_SUBMISSION_WINS` | Speedrun tasks, first-correct workflows |
| `HIGHEST_CONFIDENCE_SINGLE` | Safety-sensitive decisions where false positives are expensive |
| `APPROVAL_VOTE` | Weighted voting with quorum and settlement modes |
| `OWNER_PICK` | Subjective or creative tasks, human-in-the-loop |
| `TRUSTED_ARBITER` | High-stakes workflows requiring manual adjudication |
| `TOP_K_SPLIT` | Rewarding multiple top submissions |
| `MAJORITY_VOTE` | Simple majority classification |
| `WEIGHTED_VOTE_SIMPLE` | Explicitly weighted voting |
| `WEIGHTED_REPUTATION` | Reputation-based vote weighting |

All policies are deterministic: same inputs produce the same resolution, every time.

## What consensus-tools is NOT

- Not a chatbot
- Not a prompt marketplace
- Not a model wrapper
- Not a DAO

It's decision infrastructure.

## When to Use It

Use `consensus-tools` when:

- False positives are expensive
- Correctness matters more than speed
- You need to combine multiple agents safely
- You want auditability and economic incentives
- You're building safety-critical agent workflows

## Design Principles

- **Local-first** — Everything runs on one machine by default. No network calls unless you opt in.
- **Deterministic** — Same inputs, same resolution. Pure policy functions, no hidden state.
- **Observable** — Every decision produces a trace. Telemetry is optional but first-class.
- **Sharp boundaries** — Each package has a single responsibility with clean imports.

## Migration from v0.2.0

See [MIGRATION.md](MIGRATION.md) for a guide on migrating from the monolithic `@consensus-tools/consensus-tools@0.2.0`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and contribution guidelines.

## License

[Apache License 2.0](LICENSE)

---

One model guessing is cheap. Multiple agents earning consensus is reliable.

Build systems that deserve trust.

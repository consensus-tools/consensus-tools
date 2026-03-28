# CLAUDE.md

## What This Is

consensus-tools is a pnpm + Turborepo monorepo (Apache-2.0) providing deterministic, auditable decision infrastructure for autonomous AI agents. Weighted persona voting, configurable consensus policies, and board-native artifact trails.

## Monorepo Tooling

- **Package manager:** pnpm 9.15+ (required)
- **Build orchestration:** Turborepo
- **Node.js:** 20+
- **Module system:** ESM-only across all packages

## Commands

```bash
pnpm install                # Install all dependencies
pnpm build                  # Turbo build (all packages)
pnpm test                   # Turbo test (depends on build)
pnpm typecheck              # TypeScript checking across all packages
pnpm lint                   # Lint all packages
pnpm dep-check              # Dependency-cruiser tier enforcement (runs in CI)
pnpm changeset              # Create changeset for versioning
```

## Directory Layout

```
packages/           # Published npm packages (pnpm workspace)
  schemas/          # Tier 0 — Zod schemas, zero deps (contract layer)
  adapters/
    secrets/        # Tier 0 — AES-256-GCM credential encryption
    ai-sdk/         # Tier 1 — Vercel AI SDK adapter
    integrations/   # Tier 1 — GitHub + Linear adapters
    langchain/      # Tier 1 — LangChain tools + callbacks
    notifications/  # Tier 1 — Multi-channel HITL dispatch
    mcp/            # Tier 4 — MCP server (24 tools)
    openclaw/       # Tier 4 — OpenClaw plugin adapter
  guards/           # Tier 1 — Deterministic guard evaluation engine
  telemetry/        # Tier 1 — Event buffering, spans, redaction
  sdk-client/       # Tier 1 — HTTP client with retry/backoff
  evals/            # Tier 1 — Multi-agent LLM evaluation
  storage/          # Tier 1 — IStorage interface + JSON/SQLite/memory backends
  personas/         # Tier 1 — Persona packs, reputation, respawn
  core/             # Tier 2 — Job engine, ledger, resolution (9 policies)
  policies/         # Tier 2 — Pluggable policy registry
  workflows/        # Tier 3 — DAG execution, HITL pauses, cron
  wrapper/          # Tier 3 — Consensus gate for any async function
  universal/        # Tier 4 — Single-line governance facade
  sdk-node/         # Tier 4 — HTTP server (full REST API)
  cli/              # Tier 4 — CLI tool
apps/               # Private apps (not published)
  local-board/      # All-in-one API server (port 9888)
  dashboard/        # React/Vite web UI (port 5000)
examples/           # Example integrations and demos
skills/             # Claude Code skills (NOT a pnpm workspace member)
```

## Dependency Tier System

Dependencies flow **downward only** (Tier 0 → 1 → 2 → 3 → 4). CI enforces this via `pnpm dep-check` using dependency-cruiser. A Tier 1 package must never import from Tier 2+.

- **Tier 0 (Foundation):** schemas, secrets — zero internal deps
- **Tier 1 (Primitives):** guards, telemetry, storage, evals, personas, sdk-client, ai-sdk, integrations, langchain, notifications
- **Tier 2 (Engines):** core, policies
- **Tier 3 (Composition):** workflows, wrapper
- **Tier 4 (Integration):** universal, sdk-node, cli, mcp, openclaw

## LLM SDK Policy

LLM provider SDKs (openai, @anthropic-ai/sdk, langchain, ai, etc.) are **forbidden in production dependencies**. They may only appear in `devDependencies` for testing. CI enforces this via `scripts/check-deps.mjs`.

## Versioning

All `@consensus-tools/*` packages are linked and versioned together via changesets. Use `pnpm changeset` to create a changeset, never edit package.json versions manually. Apps (dashboard, local-board) are excluded from publishing.

## Guardrails

### Staging Discipline

**Never use `git add -A` or `git add .`** — always stage specific files by name. The `skills/` directory was accidentally deleted in v0.8.0 because a broad `git add` swept up a working-tree deletion along with intended changes. Stage only what you intend to commit.

### Protected Directories

The `skills/` directory contains Claude Code skills. It is **not a pnpm workspace member** and has no package.json — it will not appear in build/test output. It must not be deleted or removed during version bumps, cleanup, or build steps.

### Deep Imports Forbidden

All packages export only through their barrel (`dist/index.js`). Never import from internal paths like `@consensus-tools/core/dist/engine/job.js`. Dependency-cruiser enforces this in CI.

### No Circular Dependencies

Dependency-cruiser rejects circular imports. If you need shared logic between two packages at the same tier, extract it to a lower tier or into the consuming package.

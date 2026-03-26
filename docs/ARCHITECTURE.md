# Architecture: Dependency Tiers

Dependencies flow **downward only**. A package may depend on packages in its own tier or any lower tier, never on a higher tier.

```
Tier 0 — Foundation (zero internal deps)
  schemas, secrets

Tier 1 — Primitives (may depend on Tier 0)
  guards, telemetry, integrations, notifications, evals, sdk-client, storage, personas, langchain, ai-sdk

Tier 2 — Engines (may depend on Tier 0–1)
  core        → schemas, guards
  policies    → schemas, core

Tier 3 — Composition (may depend on Tier 0–2)
  workflows   → schemas, core, guards
  wrapper     → schemas, core, policies

Tier 4 — Adapters & Apps (may depend on anything below)
  universal, mcp, sdk-node, openclaw, cli
  apps/local-board, apps/dashboard
```

## Rules

1. **Downward only.** Higher-tier packages never appear in lower-tier `dependencies`.
2. **No circular dependencies** at any granularity.
3. **No deep imports.** Import `@consensus-tools/foo`, never `@consensus-tools/foo/dist/internal/bar`. Each package exposes a single barrel export via its `exports` field.
4. **LLM SDK ban.** OpenAI, Anthropic, LangChain, and similar provider SDKs must not appear in runtime `dependencies` (enforced by `scripts/check-deps.mjs`).

## Enforcement

| Check | Command | What it validates |
|-------|---------|-------------------|
| Tier rules + no-circular + no-deep-imports | `pnpm dep-check` | Scans actual source imports via dependency-cruiser |
| Forbidden runtime deps | `node scripts/check-deps.mjs` | Ensures LLM SDKs stay in devDependencies |

Both checks run in CI on every push and PR to `main`.

## Generating a dependency graph

```sh
# Requires graphviz (brew install graphviz)
pnpm dep-graph
# Outputs docs/dependency-graph.svg
```

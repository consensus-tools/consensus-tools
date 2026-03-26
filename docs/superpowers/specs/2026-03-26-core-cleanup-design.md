# Design: Core Package Cleanup — Honest Tier Boundaries

**Date:** 2026-03-26
**Branch:** feat/universal-facade
**Status:** APPROVED

## Problem

Code review found that `@consensus-tools/core` has dishonest dependency claims and leaking implementation details:

1. Top comment says "Depends only on schemas" — false (also depends on guards + storage)
2. Re-exports all of `@consensus-tools/storage` through core, muddying the tier graph
3. `Mutex` leaks through core as a public export (implementation detail)
4. `createLlmFn` constructs LLM SDK clients inside a core primitive

## Changes

### 1. Remove storage re-exports from core/index.ts

**Remove entirely:**
```typescript
// This entire section gets deleted:
export type { IStorage, StorageCaps } from "@consensus-tools/storage";
export { defaultState, applyStorageCaps, createStorage, JsonStorage, SqliteStorage, Mutex } from "@consensus-tools/storage";
```

**Update ~20 imports across these packages:**
- workflows (runner.ts, node-executor.ts, scheduler.ts) — `IStorage` type
- sdk-node (types.ts, tool-registry.ts) — `IStorage` type
- adapters/mcp (entry.ts, context.ts) — `createStorage`, `IStorage`
- adapters/openclaw (register.ts) — `createStorage`
- wrapper tests — `JsonStorage`
- apps/local-board — `createStorage`

Each changes from `"@consensus-tools/core"` to `"@consensus-tools/storage"`.

### 2. Remove createLlmFn from public exports

**Remove from core/index.ts:**
```typescript
export { createLlmFn } from "./llm-factory.js";
```

**Keep llm-factory.ts as internal module** — not deleted, just not publicly exported.

**Update 2 consumers:**
- `adapters/mcp/src/tools/board-tools.ts` — inline LLM construction (already has dynamic import)
- `cli/src/commands.ts` — inline LLM construction (already has dynamic import)

Both already do `await import("@consensus-tools/core")` — they'll instead construct LlmFn directly from the SDK they import.

### 3. Fix the comment

```typescript
// @consensus-tools/core
// Protocol engine, ledger, and resolution primitives.
// Depends on @consensus-tools/schemas and @consensus-tools/guards.
```

Remove "storage" from the description since core no longer re-exports it.

### 4. Minor: deepCopy placement

Rename `util/ids.ts` to `util/helpers.ts` since it contains both `newId` and `deepCopy`.

## Not in Scope

- Resolve strategy namespace re-export (reviewer noted, not urgent pre-1.0)
- Moving explain.ts to separate package (overkill for 2 consumers)
- Removing core's `dependency` on storage in package.json (core still USES storage internally for LocalBoard)

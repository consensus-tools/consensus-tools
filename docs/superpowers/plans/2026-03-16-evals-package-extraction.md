# Consensus Eval Package Extraction

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the consensus eval system from `examples/skill-guard-demo/` into `packages/evals/` as first-class exports, so any project can use multi-agent reputation-weighted A/B evaluation.

**Architecture:** The existing `@consensus-tools/evals` package has `evaluateWithAiSdk()` (single-model eval) and `AgentPersona`. We add `consensusEval()` (multi-agent A/B comparison), `ReputationTracker` (persistent reputation), and score validation utilities alongside the existing exports. The demo becomes a thin consumer that imports from the package.

**Tech Stack:** TypeScript, Vercel `ai` SDK (optional peer dep), `@consensus-tools/guards` (for `computeEffectiveWeight`), `@consensus-tools/schemas` (for types), vitest for tests.

---

## What Moves vs What Stays

```
MOVES TO packages/evals/:
  ┌──────────────────────────────────┬──────────────────────────────────┐
  │ Demo file                        │ Package destination              │
  ├──────────────────────────────────┼──────────────────────────────────┤
  │ lib/consensus-eval.ts            │ src/consensus-eval.ts            │
  │   consensusJudge()               │   consensusEval()  (renamed)     │
  │   weightedComposite()            │   weightedComposite()            │
  │   parseABResponse()              │   parseABResponse()              │
  │   buildABPrompt()                │   → removed, caller provides     │
  │                                  │     prompt builder function       │
  │ lib/reputation.ts                │ src/reputation.ts                │
  │   ReputationTracker              │   ReputationTracker              │
  │   settleRound()                  │   settleRound()                  │
  │   settleEval()                   │   settleEval()                   │
  │   settleDiffGuard()              │   settleDiffGuard()              │
  │ lib/judge.ts (validation only)   │ src/validation.ts                │
  │   validateScore()                │   validateScore()                │
  │   validateJudgeScore()           │   validateJudgeScore()           │
  │ lib/types.ts (shared types)      │ src/types.ts                     │
  │   JudgeScore                     │   EvalScore                      │
  │   AgentEvalScore                 │   AgentEvalScore                 │
  │   ConsensusEvalResult            │   ConsensusEvalResult            │
  │   ReputationDelta                │   ReputationDelta                │
  └──────────────────────────────────┴──────────────────────────────────┘

STAYS IN examples/skill-guard-demo/:
  ┌──────────────────────────────────┬──────────────────────────────────┐
  │ File                             │ Why it stays                     │
  ├──────────────────────────────────┼──────────────────────────────────┤
  │ lib/agents.ts                    │ Skill-doc-specific personas      │
  │ lib/proposer.ts                  │ SKILL.md-specific LLM proposer   │
  │ lib/guard-pipeline.ts            │ Uses @ct/guards directly         │
  │ lib/diff-guard.ts                │ SKILL.md diff review, demo-only  │
  │ lib/renderer.ts                  │ CLI-specific ANSI output         │
  │ main.ts                          │ Demo orchestrator                │
  │ eval-compare.ts                  │ Demo comparison script           │
  │ eval-consensus-compare.ts        │ Demo consensus comparison        │
  └──────────────────────────────────┴──────────────────────────────────┘
```

## Key Design Decisions

1. **`consensusEval()` takes a prompt builder function** — not hardcoded to SKILL.md evaluation. The caller provides `(agent, versionA, versionB) => string` so the package is domain-agnostic.

2. **`ReputationTracker` becomes provider-agnostic** — currently reads/writes JSON files. The package version takes a `storage` interface: `{ load(): Promise<State>, save(state: State): Promise<void> }` with a default JSON file implementation.

3. **Score type renamed** — `JudgeScore` → `EvalScore` (the package isn't about judges, it's about evaluation). `SkillAgent` → uses existing `AgentPersona` from the package.

4. **The `ai` SDK remains an optional peer dep** — `consensusEval()` takes a `LanguageModelV1` instance, same as the existing `evaluateWithAiSdk()`.

5. **Existing exports preserved** — `evaluateWithAiSdk`, `generatePersonas`, `respawnPersona`, `AgentPersona` all stay. New exports are additive.

---

## File Structure

```
packages/evals/
├── src/
│   ├── index.ts                    # MODIFY — add new exports
│   ├── evaluator.ts                # KEEP — existing evaluateWithAiSdk
│   ├── personas.ts                 # KEEP — existing generatePersonas
│   ├── types.ts                    # CREATE — EvalScore, ConsensusEvalResult, etc.
│   ├── validation.ts               # CREATE — validateScore, validateEvalScore
│   ├── consensus-eval.ts           # CREATE — consensusEval, weightedComposite
│   └── reputation.ts               # CREATE — ReputationTracker
├── test/
│   ├── validation.test.ts          # CREATE
│   ├── consensus-eval.test.ts      # CREATE
│   └── reputation.test.ts          # CREATE
├── package.json                    # MODIFY — add @consensus-tools/guards dep
└── tsconfig.json                   # KEEP
```

---

### Task 1: Add types and validation

**Files:**
- Create: `packages/evals/src/types.ts`
- Create: `packages/evals/src/validation.ts`
- Create: `packages/evals/test/validation.test.ts`
- Modify: `packages/evals/src/index.ts`
- Modify: `packages/evals/package.json`

- [ ] **Step 1: Write the failing test for validateScore**

```typescript
// packages/evals/test/validation.test.ts
import { describe, it, expect } from "vitest";
import { validateScore, validateEvalScore } from "../src/validation.js";

describe("validateScore", () => {
  it("accepts valid integer scores", () => {
    expect(validateScore(1)).toBe(1);
    expect(validateScore(3)).toBe(3);
    expect(validateScore(5)).toBe(5);
  });

  it("rounds float scores", () => {
    expect(validateScore(3.7)).toBe(4);
  });

  it("defaults to 2 for out-of-range", () => {
    expect(validateScore(0)).toBe(2);
    expect(validateScore(6)).toBe(2);
    expect(validateScore(NaN)).toBe(2);
  });

  it("converts numeric strings", () => {
    expect(validateScore("4")).toBe(4);
  });

  it("defaults to 2 for non-numeric", () => {
    expect(validateScore("four")).toBe(2);
    expect(validateScore(null)).toBe(2);
    expect(validateScore(undefined)).toBe(2);
  });
});

describe("validateEvalScore", () => {
  it("passes through valid scores", () => {
    const result = validateEvalScore({ clarity: 4, completeness: 3, actionability: 5, reasoning: "good" });
    expect(result).toEqual({ clarity: 4, completeness: 3, actionability: 5, reasoning: "good" });
  });

  it("fixes invalid scores to 2", () => {
    const result = validateEvalScore({ clarity: "bad", completeness: NaN, actionability: 0, reasoning: "hmm" });
    expect(result.clarity).toBe(2);
    expect(result.completeness).toBe(2);
    expect(result.actionability).toBe(2);
  });

  it("handles missing fields", () => {
    const result = validateEvalScore({});
    expect(result.clarity).toBe(2);
    expect(result.completeness).toBe(2);
    expect(result.actionability).toBe(2);
    expect(result.reasoning).toBe("No reasoning provided");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/evals && pnpm vitest run test/validation.test.ts`
Expected: FAIL — modules don't exist yet

- [ ] **Step 3: Create types.ts**

```typescript
// packages/evals/src/types.ts
import type { AgentPersona } from "./personas.js";

/** Scored evaluation on three dimensions (1-5 each). */
export interface EvalScore {
  clarity: number;
  completeness: number;
  actionability: number;
  reasoning: string;
}

/** A single agent's A/B evaluation result. */
export interface AgentEvalScore {
  agentId: string;
  agentName: string;
  reputation: number;
  aScores: EvalScore;
  bScores: EvalScore;
  winner: "A" | "B" | "TIE";
  reasoning: string;
}

/** Composite result from multi-agent consensus evaluation. */
export interface ConsensusEvalResult {
  aComposite: EvalScore;
  bComposite: EvalScore;
  winner: "A" | "B" | "TIE" | "UNKNOWN";
  agreement: number;
  delta: { clarity: number; completeness: number; actionability: number };
  perAgent: AgentEvalScore[];
  quorumMet: boolean;
}

/** A reputation change for one agent. */
export interface ReputationDelta {
  agentId: string;
  delta: number;
  reason: string;
  newReputation: number;
}

/** Persisted reputation state. */
export interface ReputationState {
  reputations: Record<string, number>;
  totalRounds: number;
  lastUpdated: string;
}

/** Storage interface for reputation persistence. */
export interface ReputationStorage {
  load(): Promise<ReputationState | null>;
  save(state: ReputationState): Promise<void>;
}

/**
 * Function that builds the A/B comparison prompt for a specific agent.
 * The caller provides this to make consensusEval domain-agnostic.
 */
export type PromptBuilder = (
  agent: AgentPersona & { reputation: number },
  versionA: string,
  versionB: string,
) => string;
```

- [ ] **Step 4: Create validation.ts**

```typescript
// packages/evals/src/validation.ts
import type { EvalScore } from "./types.js";

/** Validate that a parsed score is a number 1-5, defaulting to 2. */
export function validateScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 5) return 2;
  return Math.round(n);
}

/** Validate a parsed EvalScore object, fixing invalid values. */
export function validateEvalScore(raw: Record<string, unknown>): EvalScore {
  return {
    clarity: validateScore(raw.clarity),
    completeness: validateScore(raw.completeness),
    actionability: validateScore(raw.actionability),
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "No reasoning provided",
  };
}
```

- [ ] **Step 5: Add vitest dev dependency and test script to package.json**

Add to `packages/evals/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/evals && pnpm install && pnpm vitest run test/validation.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 7: Update index.ts with new exports**

Add to `packages/evals/src/index.ts`:
```typescript
export type { EvalScore, AgentEvalScore, ConsensusEvalResult, ReputationDelta, ReputationState, ReputationStorage, PromptBuilder } from "./types.js";
export { validateScore, validateEvalScore } from "./validation.js";
```

- [ ] **Step 8: Verify build**

Run: `cd packages/evals && pnpm run build`
Expected: Clean compile, no errors

- [ ] **Step 9: Commit**

```bash
git add packages/evals/src/types.ts packages/evals/src/validation.ts packages/evals/test/validation.test.ts packages/evals/src/index.ts packages/evals/package.json
git commit -m "feat(evals): add EvalScore types and score validation utilities"
```

---

### Task 2: Extract ReputationTracker

**Files:**
- Create: `packages/evals/src/reputation.ts`
- Create: `packages/evals/test/reputation.test.ts`
- Modify: `packages/evals/src/index.ts`
- Modify: `packages/evals/package.json` (add `@consensus-tools/guards` dep if needed for settlement)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/evals/test/reputation.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { ReputationTracker } from "../src/reputation.js";
import type { AgentPersona } from "../src/personas.js";

function makeAgents(): (AgentPersona & { reputation: number })[] {
  return [
    { id: "a1", name: "Agent 1", role: "r1", systemPrompt: "", evaluationFocus: "", reputation: 100 },
    { id: "a2", name: "Agent 2", role: "r2", systemPrompt: "", evaluationFocus: "", reputation: 100 },
    { id: "a3", name: "Agent 3", role: "r3", systemPrompt: "", evaluationFocus: "", reputation: 100 },
  ];
}

describe("ReputationTracker", () => {
  let tracker: ReputationTracker;

  beforeEach(() => {
    tracker = new ReputationTracker(makeAgents());
  });

  it("initializes all agents at their given reputation", () => {
    expect(tracker.getReputation("a1")).toBe(100);
  });

  it("payout increases reputation", () => {
    const delta = tracker.payout("a1", 4, "test");
    expect(delta.delta).toBe(4);
    expect(delta.newReputation).toBe(104);
  });

  it("slash decreases with floor at 10", () => {
    const delta = tracker.slash("a1", 200, "big slash");
    expect(delta.newReputation).toBe(10);
  });

  it("leaderboard sorts descending", () => {
    tracker.payout("a3", 10, "boost");
    const board = tracker.getLeaderboard();
    expect(board[0]!.agentId).toBe("a3");
  });

  describe("settleEval", () => {
    it("rewards aligned agents +4", () => {
      const deltas = tracker.settleEval(
        [{ agentId: "a1", winner: "B" }],
        "B",
      );
      expect(deltas[0]!.delta).toBe(4);
    });

    it("slashes misaligned agents -4", () => {
      const deltas = tracker.settleEval(
        [{ agentId: "a1", winner: "A" }],
        "B",
      );
      expect(deltas[0]!.delta).toBe(-4);
    });

    it("no settlement on TIE winner", () => {
      const deltas = tracker.settleEval(
        [{ agentId: "a1", winner: "B" }],
        "TIE",
      );
      expect(deltas).toHaveLength(0);
    });

    it("TIE vote = no settlement for that agent", () => {
      const deltas = tracker.settleEval(
        [{ agentId: "a1", winner: "TIE" }, { agentId: "a2", winner: "B" }],
        "B",
      );
      expect(deltas).toHaveLength(1);
      expect(deltas[0]!.agentId).toBe("a2");
    });
  });

  it("syncToAgents updates agent objects", () => {
    const agents = makeAgents();
    tracker.payout("a1", 15, "test");
    tracker.syncToAgents(agents);
    expect(agents[0]!.reputation).toBe(115);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/evals && pnpm vitest run test/reputation.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Create reputation.ts**

Port from `examples/skill-guard-demo/lib/reputation.ts` but make it generic:
- Accept `AgentPersona & { reputation: number }` instead of `SkillAgent`
- Take optional `ReputationStorage` for persistence instead of hardcoded file paths
- Include `settleRound()`, `settleEval()`, `settleDiffGuard()`
- Default JSON file storage implementation as a separate export

```typescript
// packages/evals/src/reputation.ts
import type { AgentPersona } from "./personas.js";
import type { ReputationDelta, ReputationState, ReputationStorage } from "./types.js";

const REP_FLOOR = 10;
const DEFAULT_REP = 100;

type AgentWithRep = AgentPersona & { reputation: number };

export class ReputationTracker {
  private reputations: Map<string, number>;
  private storage: ReputationStorage | null;
  private totalRounds: number = 0;

  constructor(agents: AgentWithRep[], storage?: ReputationStorage) {
    this.storage = storage ?? null;
    this.reputations = new Map(agents.map((a) => [a.id, a.reputation]));
  }

  async loadFromStorage(): Promise<boolean> {
    if (!this.storage) return false;
    const state = await this.storage.load();
    if (!state) return false;
    for (const [id, rep] of Object.entries(state.reputations)) {
      this.reputations.set(id, rep);
    }
    this.totalRounds = state.totalRounds;
    return true;
  }

  async saveToStorage(): Promise<void> {
    if (!this.storage) return;
    await this.storage.save({
      reputations: Object.fromEntries(this.reputations),
      totalRounds: this.totalRounds,
      lastUpdated: new Date().toISOString(),
    });
  }

  isLoaded(): boolean { return this.totalRounds > 0; }
  getTotalRounds(): number { return this.totalRounds; }
  incrementRounds(): void { this.totalRounds++; }

  getReputation(agentId: string): number {
    return this.reputations.get(agentId) ?? DEFAULT_REP;
  }

  payout(agentId: string, amount: number, reason: string): ReputationDelta {
    const current = this.getReputation(agentId);
    const newRep = current + amount;
    this.reputations.set(agentId, newRep);
    return { agentId, delta: amount, reason, newReputation: newRep };
  }

  slash(agentId: string, amount: number, reason: string): ReputationDelta {
    const current = this.getReputation(agentId);
    const newRep = Math.max(REP_FLOOR, current - amount);
    const actualDelta = -(current - newRep);
    this.reputations.set(agentId, newRep);
    return { agentId, delta: actualDelta, reason, newReputation: newRep };
  }

  getLeaderboard(): { agentId: string; reputation: number }[] {
    return [...this.reputations.entries()]
      .map(([agentId, reputation]) => ({ agentId, reputation }))
      .sort((a, b) => b.reputation - a.reputation);
  }

  /** Settle after A/B eval. ±4 symmetric. No settlement on TIE/UNKNOWN. */
  settleEval(
    perAgent: { agentId: string; winner: "A" | "B" | "TIE" }[],
    actualWinner: "A" | "B" | "TIE" | "UNKNOWN",
  ): ReputationDelta[] {
    if (actualWinner === "TIE" || actualWinner === "UNKNOWN") return [];
    const deltas: ReputationDelta[] = [];
    for (const agent of perAgent) {
      if (agent.winner === "TIE") continue;
      if (agent.winner === actualWinner) {
        deltas.push(this.payout(agent.agentId, 4, `Correctly identified ${actualWinner} as better`));
      } else {
        deltas.push(this.slash(agent.agentId, 4, `Voted ${agent.winner} but ${actualWinner} was better`));
      }
    }
    return deltas;
  }

  syncToAgents(agents: AgentWithRep[]): void {
    for (const agent of agents) {
      agent.reputation = this.getReputation(agent.id);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/evals && pnpm vitest run test/reputation.test.ts`
Expected: PASS

- [ ] **Step 5: Export from index.ts**

Add to `packages/evals/src/index.ts`:
```typescript
export { ReputationTracker } from "./reputation.js";
```

- [ ] **Step 6: Verify build**

Run: `cd packages/evals && pnpm run build`

- [ ] **Step 7: Commit**

```bash
git add packages/evals/src/reputation.ts packages/evals/test/reputation.test.ts packages/evals/src/index.ts
git commit -m "feat(evals): add ReputationTracker with settleEval and persistence interface"
```

---

### Task 3: Extract consensusEval

**Files:**
- Create: `packages/evals/src/consensus-eval.ts`
- Create: `packages/evals/test/consensus-eval.test.ts`
- Modify: `packages/evals/src/index.ts`
- Modify: `packages/evals/package.json` (add `@consensus-tools/guards` dependency)

- [ ] **Step 1: Write the failing test**

Port from `examples/skill-guard-demo/test/consensus-eval.test.ts`. Adapt to use `EvalScore` type and the package's `weightedComposite()` export. Include all 16 test cases from the eng review.

Key tests: weighted composite with unequal reps, 3-2 split winner, unanimous vote, 2-2-with-abstain, agreement calculation, short-circuit on identical inputs, below-quorum check, agent excluded on failure.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/evals && pnpm vitest run test/consensus-eval.test.ts`

- [ ] **Step 3: Create consensus-eval.ts**

Port from demo but make it generic:
- Takes `PromptBuilder` function instead of hardcoded SKILL.md prompt
- Takes `AgentPersona & { reputation: number }[]` instead of `SkillAgent[]`
- Takes `LanguageModelV1` from the `ai` SDK (optional peer dep)
- Configurable quorum and delay via options object
- Uses `computeEffectiveWeight` from `@consensus-tools/guards`
- Exports `weightedComposite()` as a standalone utility

```typescript
export interface ConsensusEvalOptions {
  minQuorum?: number;       // default: 3
  agentDelayMs?: number;    // default: 15000
  temperature?: number;     // default: 0.7
  maxTokens?: number;       // default: 1024
}

export async function consensusEval(
  versionA: string,
  versionB: string,
  agents: (AgentPersona & { reputation: number })[],
  model: LanguageModelV1,
  promptBuilder: PromptBuilder,
  options?: ConsensusEvalOptions,
): Promise<ConsensusEvalResult>
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Add @consensus-tools/guards to package.json dependencies**

```json
"dependencies": {
  "@consensus-tools/schemas": "workspace:*",
  "@consensus-tools/guards": "workspace:*"
}
```

- [ ] **Step 6: Export from index.ts**

```typescript
export { consensusEval, weightedComposite, type ConsensusEvalOptions } from "./consensus-eval.js";
```

- [ ] **Step 7: Verify build**

Run: `cd packages/evals && pnpm run build`

- [ ] **Step 8: Commit**

```bash
git add packages/evals/
git commit -m "feat(evals): add consensusEval for multi-agent A/B comparison"
```

---

### Task 4: Update demo to import from package

**Files:**
- Modify: `examples/skill-guard-demo/package.json` (already has `@consensus-tools/evals` dep)
- Modify: `examples/skill-guard-demo/lib/types.ts` — remove types that now come from package
- Modify: `examples/skill-guard-demo/lib/judge.ts` — import `validateScore`, `validateEvalScore` from package
- Modify: `examples/skill-guard-demo/lib/reputation.ts` — re-export or replace with package import
- Modify: `examples/skill-guard-demo/lib/consensus-eval.ts` — thin wrapper that imports `consensusEval` and provides SKILL.md-specific prompt builder
- Modify: `examples/skill-guard-demo/eval-consensus-compare.ts` — import from package

- [ ] **Step 1: Update demo's package.json**

Already has `"@consensus-tools/evals": "workspace:*"`. No change needed.

- [ ] **Step 2: Update types.ts — re-export from package**

```typescript
// Keep demo-specific types, re-export package types
export type { EvalScore as JudgeScore, AgentEvalScore, ConsensusEvalResult, ReputationDelta } from "@consensus-tools/evals";
// Keep demo-specific types that don't belong in the package:
export interface SkillAgent { ... }  // keep — adds systemPrompt shape
export interface SkillProposal { ... }  // keep — demo-specific
export interface GuardPipelineResult { ... }  // keep — uses @ct/schemas types
export interface RoundResult { ... }  // keep — demo-specific
```

- [ ] **Step 3: Update judge.ts — import validation from package**

Replace local `validateScore`/`validateJudgeScore` imports with:
```typescript
import { validateScore, validateEvalScore as validateJudgeScore } from "@consensus-tools/evals";
```

- [ ] **Step 4: Update consensus-eval.ts — thin wrapper**

```typescript
import { consensusEval, type ConsensusEvalOptions } from "@consensus-tools/evals";
import type { SkillAgent } from "./types.js";

// SKILL.md-specific prompt builder
function buildSkillABPrompt(agent, versionA, versionB) { ... }

// Re-export with demo-specific defaults
export async function consensusJudge(skillName, versionA, versionB, agents, model) {
  return consensusEval(versionA, versionB, agents, model,
    (agent, a, b) => buildSkillABPrompt(agent, skillName, a, b),
    { agentDelayMs: 15_000 }
  );
}
```

- [ ] **Step 5: Run demo tests**

Run: `cd examples/skill-guard-demo && pnpm vitest run`
Expected: All 73 tests pass

- [ ] **Step 6: Run full monorepo build**

Run: `pnpm -r build && pnpm -r test`

- [ ] **Step 7: Commit**

```bash
git add examples/skill-guard-demo/ packages/evals/
git commit -m "refactor(skill-guard-demo): import consensus eval from @consensus-tools/evals"
```

---

### Task 5: Update package README and add CHANGELOG entry

**Files:**
- Modify: `packages/evals/README.md`
- Modify: `packages/evals/CHANGELOG.md`

- [ ] **Step 1: Update README with consensus eval docs**

Add sections for `consensusEval()`, `ReputationTracker`, and `validateScore()` with usage examples.

- [ ] **Step 2: Add CHANGELOG entry**

```markdown
## 0.6.0

### Added
- `consensusEval()` — multi-agent A/B comparative evaluation with reputation-weighted composite scoring
- `ReputationTracker` — persistent reputation tracking with settleEval, settleRound, and settleDiffGuard
- `validateScore()`, `validateEvalScore()` — robust 1-5 score validation with NaN/string handling
- `EvalScore`, `AgentEvalScore`, `ConsensusEvalResult`, `ReputationDelta` types
- `ReputationStorage` interface for pluggable persistence
- `PromptBuilder` type for domain-agnostic A/B prompt construction
- `weightedComposite()` utility for reputation-weighted score aggregation
```

- [ ] **Step 3: Commit**

```bash
git add packages/evals/README.md packages/evals/CHANGELOG.md
git commit -m "docs(evals): add consensus eval documentation and changelog"
```

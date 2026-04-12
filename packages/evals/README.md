# @consensus-tools/evals

Multi-agent evaluation for consensus-tools. Run single-model evals, multi-agent A/B comparisons with reputation-weighted scoring, and validate LLM-generated scores.

## Install

```bash
pnpm add @consensus-tools/evals
```

For `consensusEval()`, you also need the Vercel AI SDK and a provider:

```bash
pnpm add ai @ai-sdk/anthropic
```

## Guard evaluation with LLM personas

Use `evaluateWithAiSdk` to have AI personas evaluate a guard action and return weighted votes:

```typescript
import { evaluateWithAiSdk, generatePersonas } from "@consensus-tools/evals";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";

const personas = generatePersonas(3); // returns EvalPersonaConfig[]

const input: GuardEvaluateInput = {
  agentId: "bot-1",
  action: { type: "code_merge", payload: { diff: "..." } },
};

const votes = await evaluateWithAiSdk(input, personas, {
  model: "gpt-4o-mini",     // optional, defaults to env AI_MODEL or gpt-4o-mini
  apiKey: "sk-...",          // optional, defaults to env OPENAI_API_KEY
  allowDeterministicFallback: true, // use regex fallback when no API key
});
// votes: GuardVote[] — one vote per persona
```

## Multi-agent consensus evaluation

Run N agents that each score two versions on clarity, completeness, and actionability, then pick a winner. Composite scores are weighted by agent reputation.

```typescript
import { consensusEval, ReputationTracker } from "@consensus-tools/evals";
import { generatePersonas } from "@consensus-tools/evals";
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic();
const model = anthropic("claude-sonnet-4-20250514");
const personas = generatePersonas(5);
const agents = personas.map((p) => ({ ...p, reputation: 100 }));

const result = await consensusEval(versionA, versionB, agents, model, (agent, a, b) => {
  return `You are ${agent.name}. Score both versions on clarity, completeness, and actionability (1-5). Pick a winner.

Version A:
${a}

Version B:
${b}

Respond with JSON: { "a_scores": { "clarity": N, "completeness": N, "actionability": N }, "b_scores": { ... }, "winner": "A"|"B"|"TIE", "reasoning": "..." }`;
});

console.log(result.winner);     // "A" | "B" | "TIE" | "UNKNOWN"
console.log(result.agreement);  // 0.0 - 1.0
console.log(result.aComposite); // { clarity, completeness, actionability, reasoning }
```

### Options

```typescript
consensusEval(versionA, versionB, agents, model, promptBuilder, {
  minQuorum: 3,        // minimum agents needed (default: 3)
  agentDelayMs: 15000, // delay between agent calls (default: 15000)
  temperature: 0.7,    // LLM temperature (default: 0.7)
  maxTokens: 1024,     // max tokens per response (default: 1024)
  onAgentError: (agent, err) => console.error(`${agent.name}: ${err.message}`),
});
```

## Reputation tracking

Track agent reputation across rounds. Agents that align with ground truth earn reputation (+4). Agents that disagree lose it (-4). Floor at 10 — agents are never fully silenced.

```typescript
import { ReputationTracker } from "@consensus-tools/evals";

const tracker = new ReputationTracker(agents);

// After an A/B eval — settle based on who voted correctly
const deltas = tracker.settleEval(
  result.perAgent.map((a) => ({ agentId: a.agentId, winner: a.winner })),
  result.winner,
);

// After a guard proposal round — settle based on judge scores
const deltas = tracker.settleRound(votes, judgeScores, proposerId, decision, rewriteCount, maxRewrites);

// Sync updated reputations back to agent objects
tracker.syncToAgents(agents);
```

### Pluggable persistence

```typescript
import type { ReputationStorage } from "@consensus-tools/evals";

const storage: ReputationStorage = {
  async load() { return JSON.parse(await fs.readFile("rep.json", "utf-8")); },
  async save(state) { await fs.writeFile("rep.json", JSON.stringify(state)); },
};

const tracker = new ReputationTracker(agents, storage);
await tracker.loadFromStorage();
// ... run evals ...
await tracker.saveToStorage();
```

## Score validation

Safely parse LLM-generated scores. Out-of-range, NaN, and non-numeric values default to 2.

```typescript
import { validateScore, validateJudgeScore } from "@consensus-tools/evals";

validateScore(4);       // 4
validateScore("3.7");   // 4 (rounds)
validateScore(NaN);     // 2 (default)
validateScore(0);       // 2 (below range)

validateJudgeScore({ clarity: 4, completeness: "bad", actionability: 6 });
// { clarity: 4, completeness: 2, actionability: 2, reasoning: "No reasoning provided" }
```

## Exports

| Export | Description |
|--------|-------------|
| `evaluateWithAiSdk` | LLM persona guard evaluation (returns `GuardVote[]`) |
| `generatePersonas` | Generate diverse evaluator personas |
| `respawnPersona` | Replace a persona with a new one |
| `consensusEval` | Multi-agent A/B comparative evaluation |
| `weightedComposite` | Reputation-weighted score aggregation |
| `parseABResponse` | Parse structured A/B JSON from LLM response |
| `ReputationTracker` | Agent reputation tracking with settlement |
| `validateScore` | Validate a single 1-5 score |
| `validateJudgeScore` | Validate a full JudgeScore object |

## Types

| Type | Description |
|------|-------------|
| `AgentPersona` | Agent identity (id, name, role, systemPrompt, evaluationFocus) |
| `JudgeScore` | Three-dimension score (clarity, completeness, actionability, reasoning) |
| `AgentEvalScore` | One agent's A/B result (scores for both versions + winner) |
| `ConsensusEvalResult` | Composite result from all agents (weighted scores, winner, agreement) |
| `ReputationDelta` | A single reputation change (agent, delta, reason, newReputation) |
| `ReputationState` | Serialized reputation state for persistence |
| `ReputationStorage` | Interface for pluggable reputation persistence |
| `PromptBuilder` | `(agent, versionA, versionB) => string` |
| `ConsensusEvalOptions` | Options for `consensusEval()` |

## Links

- [consensus-tools on GitHub](https://github.com/consensus-tools/toolkit)
- [Skill guard demo](../../examples/skill-guard-demo) — end-to-end example using consensusEval

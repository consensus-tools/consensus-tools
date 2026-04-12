# @consensus-tools/personas

Persona lifecycle for consensus-tools — types, default packs, deterministic reputation updates, and persona respawn with learning.

## Install

```bash
pnpm add @consensus-tools/personas
```

## Persona Packs

Three built-in packs of personas ready to use:

| Pack | Count | Focus |
|------|-------|-------|
| `default` | 3 | Security analyst, compliance officer, operations engineer |
| `skill-review` | 5 | Specialists for SKILL.md evaluation |
| `governance` | 5 | Lifecycle personas for consensus voting (with reputation) |

```typescript
import { getPersonasByPack, getEvalPersonas, PERSONA_PACKS } from "@consensus-tools/personas";

// Get governance personas (PersonaConfig[])
const voters = getPersonasByPack("governance");

// Get evaluation personas with systemPrompt + evaluationFocus (EvalPersonaConfig[])
const evalPersonas = getEvalPersonas("default", 3);

// List available pack names
console.log(PERSONA_PACKS); // ["default", "skill-review", "governance"]
```

## Reputation Updates

Deterministic reputation engine. Aligned voters gain reputation, misaligned voters lose it, with a confidence penalty boost for high-confidence wrong votes.

```typescript
import { updateReputation, DEFAULT_RULESET } from "@consensus-tools/personas";

const votes = [
  { persona_id: "security-analyst", vote: "NO", confidence: 0.9 },
  { persona_id: "compliance-officer", vote: "YES", confidence: 0.7 },
];

const result = updateReputation(votes, "BLOCK", voters, DEFAULT_RULESET);
// result.changes: ReputationChange[] — per-persona delta and new reputation
```

### Default Ruleset

| Parameter | Value | Effect |
|-----------|-------|--------|
| `rewardAligned` | +0.02 | Aligned with final decision |
| `penalizeMisaligned` | -0.03 | Disagreed with final decision |
| `highConfidencePenaltyBoost` | -0.02 | Extra penalty for confident wrong votes |
| `minRep` | 0.05 | Floor — personas are never fully silenced |
| `maxRep` | 0.95 | Ceiling |

## Persona Respawn

When a persona's reputation drops too low, analyze its mistakes and create a successor:

```typescript
import { buildLearningSummary, mutatePersona } from "@consensus-tools/personas";

// Analyze past decisions to find mistake patterns
const learning = buildLearningSummary("security-analyst", decisionHistory);
// learning: { source_decisions: number, mistake_patterns: string[] }

// Create a successor persona informed by learning
const successor = mutatePersona(originalPersona, learning);
// successor: PersonaConfig with updated bias/non_negotiables
```

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `getPersonasByPack(pack)` | Function | Get lifecycle personas by pack name |
| `getEvalPersonas(pack, count?)` | Function | Get evaluation personas with prompt fields |
| `PERSONA_PACKS` | Const | List of available pack names |
| `updateReputation(input)` | Function | Deterministic reputation update engine |
| `DEFAULT_RULESET` | Const | Default reputation update rules |
| `buildLearningSummary(id, history)` | Function | Analyze past decisions for mistake patterns |
| `mutatePersona(persona, learning)` | Function | Create successor persona from learning |
| `PersonaConfig` | Type | Base persona (id, name, role, reputation?, bias?) |
| `EvalPersonaConfig` | Type | Evaluation persona (extends PersonaConfig with systemPrompt, evaluationFocus) |
| `PersonaSet` | Type | Set of personas with metadata and lineage |
| `ReputationRuleset` | Type | Configurable reputation update rules |
| `ReputationChange` | Type | One persona's reputation delta |
| `ReputationDeltaResult` | Type | Full reputation update result |
| `LearningSummary` | Type | Learning analysis from decision history |
| `RespawnResult` | Type | Result of a persona respawn operation |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/toolkit)

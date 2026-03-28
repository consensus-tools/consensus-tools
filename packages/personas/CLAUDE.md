# @consensus-tools/personas

Persona lifecycle: types, default packs, deterministic reputation engine, and respawn with learning summaries.

## Key Exports

- `getPersonasByPack(name)` / `getEvalPersonas(packName, count)` — load persona configs
- `updateReputation(votes, truth, voters, ruleset)` — deterministic reputation updates
- `buildLearningSummary(persona, results)` / `mutatePersona(persona, learning)` — respawn flow

## Built-in Packs

- **default** (3): security-analyst, compliance-officer, operations-engineer
- **skill-review** (5): doc-architect, api-accuracy, agent-usability, completeness-auditor, style-guardian
- **governance** (5): lifecycle personas for consensus voting

## Gotchas

- Packs are immutable defaults defined in code.
- Reputation model: +0.02 (aligned), -0.03 (misaligned), high-confidence penalty -0.02. Scores are floats clamped to [0.05, 0.95].
- `updateReputation()` requires a ground-truth label (ALLOW/BLOCK/...) to score against.

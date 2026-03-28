# @consensus-tools/personas

Persona lifecycle: types, default packs, deterministic reputation engine, and respawn with learning summaries.

## Key Exports

- `getPersonasByPack(name)` / `getEvalPersonas(packName, count)` — load persona configs
- `updateReputation(votes, truth, voters, ruleset)` — deterministic reputation updates
- `buildLearningSummary(persona, results)` / `mutatePersona(persona, learning)` — respawn flow

## Built-in Packs

- **default** (3): security-analyst, compliance-officer, operations-engineer
- **skill-review** (5): doc-architect, code-reviewer, ux-specialist, etc.
- **governance** (5): lifecycle personas for consensus voting

## Gotchas

- Packs are immutable defaults defined in code.
- Reputation model: ±4 symmetric (aligned/misaligned), floor of 10 (agents never fully silenced).
- `updateReputation()` requires a ground-truth label (ALLOW/BLOCK/...) to score against.

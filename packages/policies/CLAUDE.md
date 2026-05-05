# @consensus-tools/policies

Pluggable policy registry wrapping all 9 built-in resolution strategies from core.

## Key Exports

- `createPolicyRegistry()` — returns `Map<ConsensusPolicyType, PolicyResolver>`
- `createRegistryResolver(registry?)` — wraps registry into a single `PolicyResolver` function
- Re-exports all 9 policy functions from core

## Gotchas

- Unknown policy type in registry throws (not a fallback).
- `ConsensusInput.reputation(agentId)` must be callable — it's required, not optional.
- No policy composition — pick one per resolution.

## Code Style

- Unknown policy types throw — no fallback. Callers must validate the policy string before resolving. Fail-loud beats silently picking the wrong winner.
- Policy functions are **pure**: `(input) => result`. No state between calls, no I/O, no time.
- `reputation(agentId)` is required, not optional. Provide a constant function (e.g., `() => 100`) when reputation isn't tracked — don't make it nullable.
- No policy composition layer. Pick one strategy per resolution and commit. Combinators here would be a slippery slope toward a DSL nobody wants to maintain.
- Adding a new policy: implement the function, register it in `createPolicyRegistry()`, add a fixture test, add the type to `consensusPolicyTypeSchema`. Four-file change, all in one commit.

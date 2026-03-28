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

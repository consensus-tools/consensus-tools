# @consensus-tools/core

Protocol engine, ledger, and resolution primitives. Post jobs, collect submissions, vote, resolve winners, track balances. Runs entirely locally without network.

## Key Exports

**Engine:**
- `JobEngine` — full job lifecycle: `postJob`, `claimJob`, `submitJob`, `voteJob`, `resolveJob`
- `LedgerEngine` — token balance tracking, slashing, reputation
- `GuardEngine` — evaluate actions against guard rules
- `HitlTracker` — human-in-the-loop decision tracking
- `LocalBoard` — convenience wrapper combining engine + ledger
- `AgentRegistry` — track agents and their capabilities

**Resolution (9 policies):**
- `firstSubmissionWins`, `highestConfidenceSingle`, `approvalVote`, `ownerPick`, `trustedArbiter`, `topKSplit`, `majorityVote`, `weightedVoteSimple`, `weightedReputation`

**Utilities:**
- `resolveConsensus()` — dispatch resolution by policy type
- `explainDecision()` — LLM-backed explanation (requires custom LlmFn)
- `summarizeGuardActivity()` — audit summaries
- `newId()`, `deepCopy()`, `nowIso()`, `addSeconds()`, `isPast()`

## Architecture

- Engine pattern: post → claim → submit → vote → resolve
- `JobEngine` takes `IStorage` interface, not a concrete implementation
- Slashing is calculated during resolution based on `SlashingPolicy`
- Two resolution paths: deterministic (policy dispatch) + LLM-backed explanation

## Gotchas

- **`await storage.init()` must be called before engine use.**
- `claimJob` requires `leaseSeconds`; expired leases allow re-claiming.
- `explainDecision()` needs a caller-provided LLM function — it's not baked in.
- `better-sqlite3` is an optional dependency for local board implementations.

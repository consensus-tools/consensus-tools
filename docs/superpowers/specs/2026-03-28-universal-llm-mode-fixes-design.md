# Universal LLM Mode Fixes — Design Spec

**Date:** 2026-03-28
**Package:** `@consensus-tools/universal`
**Scope:** Three bugs in the LLM Persona Mode path found during adversarial review of the v0.9.1 README update.

## Problem

The v0.9.1 LLM Persona Mode has three gaps between documented behavior and actual behavior:

1. **Policy selection is cosmetic.** `deliberate()` calls `resolveConsensus()` with the configured policy but ignores the result. Action determination uses raw vote counting (`yesCount > noCount`) regardless of policy. A user configuring `WEIGHTED_REPUTATION` gets simple majority.

2. **`onFeedback` is dead config.** `createLlmExecutor()` accepts `onFeedback` in config but never wires it to `ReputationManager.processFeedback()`. The reputation manager is captured in a closure with no external access. Reputation never updates from human signals.

3. **LLM mode has no audit persistence.** The `storage` config option and audit hooks (`resolveStorage`, `createStorageHooks`) only run in the regex path. LLM mode writes nothing to storage.

## Fix 1: Policy-Aware Action Determination

### Current behavior (lines 371-386 of persona-reviewer-factory.ts)

```typescript
const yesCount = voteResults.filter((v) => v.vote === "YES").length;
const noCount = voteResults.filter((v) => v.vote === "NO").length;
const rewriteCount = voteResults.filter((v) => v.vote === "REWRITE").length;

let action: "allow" | "block" | "escalate";
if (rewriteCount > voteResults.length / 2) {
  action = "escalate";
} else if (yesCount > noCount) {
  action = "allow";
} else {
  action = "block";
}
```

### Why raw vote counting was introduced

v0.9.0 had an "always-a-winner" problem: `resolveConsensus` with `voteBased` policies always returns a winner if at least one submission exists, even with a negative score. The code comment says "avoids the always-a-winner problem." But v0.9.1 already fixed the input shape (single submission, N votes), so the score on that submission is now meaningful — it's the net weighted sum of all persona votes.

### New behavior

Replace raw vote counting with policy-aware score reading:

1. **Rewrite majority check stays.** `rewriteCount > half → escalate` is an override before any policy check. This is a universal safeguard.

2. **APPROVAL_VOTE** (maps from `supermajority`, `unanimous`, `threshold:X`): has built-in threshold checks (`minScore`, `minMargin`). Returns empty `winners` when thresholds aren't met. Empty winners → block, non-empty → allow.

3. **voteBased policies** (MAJORITY_VOTE, WEIGHTED_REPUTATION, WEIGHTED_VOTE_SIMPLE): read `consensusTrace.scores[submissionId]`. Positive score → allow, zero or negative → block. This respects reputation weighting since `WEIGHTED_REPUTATION` computes `vote.score * reputation` per vote.

4. **Other policies** (FIRST_SUBMISSION_WINS, HIGHEST_CONFIDENCE_SINGLE, OWNER_PICK, TRUSTED_ARBITER, TOP_K_SPLIT): fall back to raw vote counting. These are single-winner or manual-pick policies that don't map well to governance deliberation.

### Setting consensusPolicy for threshold policies

When the user configures `supermajority` or `unanimous`, `resolvePolicyType()` maps them to `APPROVAL_VOTE`. We need to also set `minScore` on the `consensusPolicy` object in the synthesized job:

Vote scores in `deliberate()` are: YES=+1, NO=-1, REWRITE=0. With N personas, total score ranges from -N to +N. To convert an approval percentage `p` (0-1) to a minScore: `minScore = N * (2p - 1)`.

- `majority` → `APPROVAL_VOTE` with `minScore: 0.01` (any net positive passes, ties block)
- `supermajority` → `APPROVAL_VOTE` with `minScore: N * (2 * 0.67 - 1)` = `N * 0.34`
- `unanimous` → `APPROVAL_VOTE` with `minScore: N * 1.0` = `N` (all must approve)
- `threshold:X` → `APPROVAL_VOTE` with `minScore: N * (2X - 1)`

APPROVAL_VOTE uses strict less-than (`score < minScore → block`), so exact threshold matches pass.

Currently the job's `consensusPolicy` is `{ type: config.policyType }` with no additional fields. We'll add `minScore` and `minMargin: 0` for APPROVAL_VOTE policies. The `PersonaReviewerConfig` interface needs a new `originalPolicy` field to carry the user-facing policy string (before `resolvePolicyType` mapping) so we can compute the correct threshold.

### Changes

**File:** `packages/universal/src/persona-reviewer-factory.ts`

- Replace lines 371-386 with a `determineAction()` function that reads the consensus result.
- Pass the original user-facing policy string (before `resolvePolicyType` mapping) so we can set `minScore` for threshold policies.
- Add `minScore`/`minMargin` to the synthesized job's `consensusPolicy` when `policyType === "APPROVAL_VOTE"`.

### Action determination logic

```
function determineAction(
  voteResults,
  consensusResult,
  submissionId,
  policyType
): "allow" | "block" | "escalate"

1. rewriteCount > half → escalate
2. APPROVAL_VOTE → empty winners → block, non-empty → allow
3. voteBased (MAJORITY_VOTE, WEIGHTED_REPUTATION, WEIGHTED_VOTE_SIMPLE) →
   read consensusTrace.scores[submissionId], positive → allow, else → block
4. All others → yesCount > noCount → allow, else → block
```

## Fix 2: Wire onFeedback to ReputationManager

### Design

Make `consensus.wrap()` return an **augmented executor** when `model` is provided. The returned function has an additional `.feedback(signal)` method that calls `reputationManager.processFeedback(signal)`.

```typescript
type AugmentedExecutor = ToolExecutor & {
  feedback(signal: FeedbackSignal): void;
};
```

This is backwards-compatible: the function is still callable as a `ToolExecutor`. The `.feedback` method is additive.

### Changes

**File:** `packages/universal/src/index.ts`

- `createLlmExecutor()` returns `AugmentedExecutor` instead of `ToolExecutor`.
- Attach `executor.feedback` to the returned function.
- Keep `onFeedback` as a **notification hook** that fires after `processFeedback` completes (so the user can log/react to reputation changes). The `.feedback()` method is the ingestion point.

Flow: user calls `safe.feedback(signal)` → `reputationManager.processFeedback(signal)` → `config.onFeedback?.(signal)` fires as notification.

**File:** `packages/universal/src/types.ts`

- Add `AugmentedExecutor` type export.
- Update `onFeedback` JSDoc to clarify it's a notification hook, not the ingestion point.

## Fix 3: Audit Storage in LLM Mode

### Design

After each `deliberate()` call in `createLlmExecutor()`, write an audit entry to the configured storage backend. Reuse the same `resolveStorage()` helper and write format as the regex path.

### Changes

**File:** `packages/universal/src/index.ts`

In `createLlmExecutor()`:

1. Call `resolveStorage(config.storage)` to get the storage backend.
2. After `deliberate()` returns and `onDecision` fires, write an audit entry:

```typescript
await store.update((state) => {
  state.audit.push({
    id: `audit-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    action: decision.action,
    aggregateScore: decision.aggregateScore,
    policy: decision.policy,
    decisionId: decision.decisionId,
    personaCount: decision.votes.length,
    mode: mode, // "enforce" or "shadow"
  });
});
```

3. Production warning for `storage: "memory"` now applies to LLM mode too (remove the `&& !config?.model` guard on line 243).

## Files Changed

| File | Change |
|---|---|
| `packages/universal/src/persona-reviewer-factory.ts` | Replace raw vote counting with `determineAction()` that reads consensus scores. Add `minScore`/`minMargin` to job for APPROVAL_VOTE. Accept original policy string for threshold computation. |
| `packages/universal/src/index.ts` | Wire `.feedback()` on returned executor. Add storage hooks to LLM path. Remove `!config?.model` guard on storage warning. Update `createLlmExecutor` return type. |
| `packages/universal/src/types.ts` | Add `AugmentedExecutor` type. Update `onFeedback` JSDoc. |
| `packages/universal/README.md` | Remove v0.9.1 caveats about policy, onFeedback, and storage. Document `.feedback()` method. |

## Testing

Each fix gets its own test file additions in `packages/universal/test/`:

1. **Policy action determination:** Test that WEIGHTED_REPUTATION with high-rep NO voters blocks even when YES count is higher. Test APPROVAL_VOTE threshold rejection. Test rewrite-majority escalation still works.
2. **Feedback wiring:** Test that `safe.feedback({ type: "override_block", decisionId })` updates reputation. Test that `onFeedback` notification fires after processing.
3. **Audit storage:** Test that LLM mode writes audit entries to configured storage. Test that shadow mode also writes audit entries.

## Non-Goals

- Changing the `resolveConsensus` function in core (it works correctly for its intended use case of multi-submission jobs).
- Adding score thresholds to the `voteBased` helper (that would affect all core consumers).
- Re-exporting `PersonaConfig` from universal (separate concern).

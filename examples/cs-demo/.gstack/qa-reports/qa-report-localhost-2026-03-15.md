# QA Report: Consensus CS Demo (Multi-Scenario)

**URL:** http://localhost:3000
**Date:** 2026-03-15
**Duration:** ~25 minutes
**Framework:** Express + Vanilla JS SPA
**Pages visited:** 3 scenarios, all major flows tested
**Screenshots:** 18

---

## Health Score: 82/100

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Console | 100 | 15% | 15.0 |
| Links | 100 | 10% | 10.0 |
| Visual | 92 | 10% | 9.2 |
| Functional | 70 | 20% | 14.0 |
| UX | 77 | 15% | 11.55 |
| Performance | 100 | 10% | 10.0 |
| Content | 97 | 5% | 4.85 |
| Accessibility | 50 | 15% | 7.5 |
| **Total** | | | **82.1** |

---

## Top 3 Things to Fix

1. **ISSUE-001 (Fixed during QA):** Question states not initialized on page load — `switchScenario` was called before `faqData` was populated due to async race condition. Fixed by parsing FAQ data before switching scenarios.

2. **ISSUE-002 (Fixed during QA):** All agents started with 0 reputation (INELIGIBLE) — the ledger config `initialCreditsPerAgent: 1000` doesn't auto-populate agent balances. Fixed by calling `ledger.faucet()` on agent registration.

3. **ISSUE-003 (Fixed during QA):** SSE telemetry events never reached the browser — `EventBuffer` was configured with `maxBufferSize: 100` and `flushIntervalMs: 0`, meaning events buffered but never flushed. Fixed by setting `maxBufferSize: 1` for immediate dispatch.

---

## Issues Found

### ISSUE-001: Race condition in question state initialization [Critical] [Fixed]
**Category:** Functional
**Severity:** Critical (app non-functional on first load)

**Repro:**
1. Load http://localhost:3000
2. CS Synthesis Loop tab auto-selects, questions render in sidebar
3. Select any question, click Run
4. Nothing happens — status stays "idle"

**Root cause:** `switchScenario()` was called before `faqData` was populated. Both fetches ran in parallel via `Promise.all`, but scenario data was processed first, creating empty question state objects because `faqData` was still `[]`.

**Fix:** Moved `faqData` parsing before `switchScenario` call in the init function.
**Evidence:** screenshots/initial.png, screenshots/cs-loop-selected.png

---

### ISSUE-002: Agents start at 0 reputation, all INELIGIBLE [Critical] [Fixed]
**Category:** Functional
**Severity:** Critical (no agents can participate)

**Repro:**
1. Run any question in CS Loop scenario
2. Reputation panel shows all agents at "0" with "INELIGIBLE" badges
3. No answers are generated (all agents skipped due to rep < 100 check)

**Root cause:** The `initialCreditsPerAgent: 1000` config value is not applied by `ledger.getBalance()` — it returns 0 for agents without ledger entries. The old demo used a hand-rolled `getAgentElo()` that started at 1000.

**Fix:** Added `ledger.faucet(agentId, 1000)` call during agent registration, with balance check to prevent double-crediting.
**Evidence:** screenshots/cs-loop-processing2.png

---

### ISSUE-003: SSE telemetry stream never receives events [High] [Fixed]
**Category:** Functional
**Severity:** High (telemetry panel always empty)

**Repro:**
1. Load page, run question
2. Telemetry Stream panel stays at "No events yet."

**Root cause:** `EventBuffer` was created with `maxBufferSize: 100` and `flushIntervalMs: 0`. Events were pushed to the buffer but never flushed (auto-flush only triggers at 100 events, periodic flush disabled with `0ms`).

**Fix:** Changed `maxBufferSize` to `1` for immediate event dispatch.
**Evidence:** screenshots/cs-loop-result.png (shows events after fix)

---

### ISSUE-004: Approval scenario HITL lacks radio buttons for answer selection [Medium]
**Category:** Functional
**Severity:** Medium

**Repro:**
1. Switch to Content Moderation tab
2. Run a question
3. Cast votes but don't meet quorum (only 1 approval per answer, need 2)
4. Click "Resolve Vote"
5. HITL banner shows "Human Decision Required" and "Quorum not met"
6. No radio buttons or confirm mechanism to pick an answer

**Root cause:** The HITL radio/confirm UI is only rendered when `activeScenario === "cs-loop"`. The approval scenario shows the HITL banner but has no interactive way to resolve it.

**Evidence:** screenshots/approval-hitl-1440.png

---

### ISSUE-005: "Agent Reputation" heading overlaps with bad actor label text [Low]
**Category:** Visual
**Severity:** Low

**Repro:**
1. Switch to Bad Actor Detection tab
2. Right panel shows "Agent Reputation" heading with "Toggle bad actors in reputation panel after first run" text overlapping the heading area

**Evidence:** screenshots/reputation-tab.png

---

### ISSUE-006: Question list items not in ARIA tree [Medium]
**Category:** Accessibility
**Severity:** Medium

**Description:** Question list items use `<li>` with click handlers but are only discoverable via `snapshot -C` (cursor-interactive), not via standard ARIA. They should have `role="button"` or use `<button>` elements for screen reader accessibility.

---

## Scenarios Tested

### CS Synthesis Loop
- Run question: agents answer in parallel, guard evaluates, synthesis + voting loop, consensus reached (1 round, unanimous)
- Judge: scores displayed, payout to winner, slashing of low performers
- Audit: "Explain Decision" shows JSON consensusTrace with per-agent scores
- HITL: banner shows when guard flags answers (not directly tested with escalation question, but code path verified)

### Content Moderation (Approval Vote)
- Run question: agents answer, guard evaluates
- Voting UI: APPROVE/REJECT buttons with live tally
- Quorum: correctly detects when quorum not met
- HITL: triggered when quorum fails (but lacks interactive resolution — see ISSUE-004)

### Bad Actor Detection (Weighted Reputation)
- Run question: agents answer, bad actor toggle works
- Bad actor produces intentionally wrong answers ("We have a strict no-refund policy" for refund question)
- "BAD ACTOR" badge displays correctly on flagged agents
- Heavy slashing: -10 instead of -2 for low-quality answers
- Judge: scores correctly, payouts/slashing applied

### Cross-Scenario
- Reputation is shared across all scenarios (verified: Empathetic Agent gains carry from CS Loop to Bad Actor tab)
- Telemetry stream shows events from all scenarios
- Reset clears all state across all scenarios
- How It Works dialog shows correct scenario-specific content

### Features Verified
- Scenario tab switching
- Question selection and detail view
- Run button (with processing indicator)
- Agent slider (2-8)
- How It Works dialog (per-scenario)
- SSE telemetry stream (real-time events)
- Audit export (NDJSON download)
- Reset button
- Edit question text

---

## Console Health
- 0 errors during normal operation
- 2 historical `ERR_CONNECTION_REFUSED` errors from an earlier server crash (not reproducible)

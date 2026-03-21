# T13 + T14: GitHub Auth & AI-Powered Audit Explainer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated GitHub API access to skill-version-eval (T13) and build an AI-powered audit explainer that converts raw guard/wrapper decision data into human-readable narratives (T14).

**Architecture:** T13 is a minimal change — add an optional `Authorization` header in `githubFetch()` when `GITHUB_TOKEN` env var is set, plus a 401 error enrichment. T14 introduces `explainDecision()` in `@consensus-tools/core` that accepts any vote format (GuardVote or ReviewResult), normalizes to a common shape, builds a prompt, and calls a user-provided LLM callback. Exposed via MCP tool (`audit.explain`) and CLI command (`consensus-tools explain`). Fail-loudly on LLM errors — no template fallback.

**Tech Stack:** TypeScript, vitest, @consensus-tools/core, @consensus-tools/mcp, @consensus-tools/cli, commander

---

## File Structure

### T13 — GitHub API Auth (2 files modified)

| File | Action | Responsibility |
|------|--------|----------------|
| `examples/skill-version-eval/src/fetcher.ts` | Modify | Add `Authorization` header when `GITHUB_TOKEN` is set; add 401 error enrichment |
| `examples/skill-version-eval/src/fetcher.test.ts` | Modify | Add tests for auth header and 401 handling |

### T14 — AI Audit Explainer (7 files)

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/schemas/src/explain.ts` | Create | `ExplainInput`, `ExplainResult`, `NormalizedVote` types |
| `packages/schemas/src/index.ts` | Modify | Re-export explain types |
| `packages/core/src/explain.ts` | Create | `explainDecision()` function — normalize votes, build prompt, call LLM |
| `packages/core/src/index.ts` | Modify | Re-export `explainDecision` and types |
| `packages/core/tests/explain.test.ts` | Create | Unit tests for explainDecision with mocked LLM |
| `packages/adapters/mcp/src/tools/board-tools.ts` | Modify | Add `audit.explain` tool |
| `packages/cli/src/commands.ts` | Modify | Add `explain <auditId>` command |

---

## Task 1: T13 — GitHub API Auth Header

**Files:**
- Modify: `examples/skill-version-eval/src/fetcher.ts:25-51`
- Modify: `examples/skill-version-eval/src/fetcher.test.ts`

- [ ] **Step 1: Write failing test — auth header is sent when GITHUB_TOKEN is set**

Add this test to `fetcher.test.ts`. Note: this file uses `bun:test` (Bun runtime), not vitest.

```typescript
// Add to the end of the file, after the "listCommits — edge cases" describe block

describe("githubFetch — authentication", () => {
  test("sends Authorization header when GITHUB_TOKEN is set", async () => {
    const { listCommits } = await import("./fetcher.js");

    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_test_token_123";

    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}),
      );
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    try {
      await listCommits("owner", "repo", "file.md");
      expect(capturedHeaders["Authorization"]).toBe("Bearer ghp_test_token_123");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });

  test("does NOT send Authorization header when GITHUB_TOKEN is unset", async () => {
    const { listCommits } = await import("./fetcher.js");

    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}),
      );
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    try {
      await listCommits("owner", "repo", "file.md");
      expect(capturedHeaders["Authorization"]).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });

  test("401 with GITHUB_TOKEN set throws enriched error mentioning token", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_bad_token";

    globalThis.fetch = mock(async () => {
      return new Response("Bad credentials", { status: 401 });
    }) as typeof fetch;

    try {
      await expect(listCommits("owner", "repo", "file.md")).rejects.toThrow("GITHUB_TOKEN");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });

  test("401 without GITHUB_TOKEN throws generic 401 error", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    globalThis.fetch = mock(async () => {
      return new Response("Bad credentials", { status: 401 });
    }) as typeof fetch;

    try {
      await expect(listCommits("owner", "repo", "file.md")).rejects.toThrow("401");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd consensus-tools/examples/skill-version-eval && bun test`
Expected: 4 new tests FAIL (Authorization header not sent, 401 not handled)

- [ ] **Step 3: Implement auth header + 401 handling in fetcher.ts**

Modify `githubFetch()` in `examples/skill-version-eval/src/fetcher.ts:25-51`:

```typescript
async function githubFetch(path: string, accept?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Accept: accept || "application/vnd.github+json",
    };

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${GITHUB_API}${path}`, {
      headers,
      signal: controller.signal,
    });

    if (res.status === 401) {
      if (token) {
        throw new Error("GitHub API authentication failed (401) — check your GITHUB_TOKEN is valid and not expired");
      }
      throw new Error(`GitHub API unauthorized (401): ${await res.text().catch(() => "unknown")}`);
    }

    if (res.status === 403) {
      const remaining = res.headers.get("X-RateLimit-Remaining");
      if (remaining === "0") {
        throw new Error("GitHub API rate limit exceeded — try again later");
      }
      throw new Error(`GitHub API forbidden (403): ${await res.text().catch(() => "unknown")}`);
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd consensus-tools/examples/skill-version-eval && bun test`
Expected: All tests PASS (existing + 4 new)

- [ ] **Step 5: Commit**

```bash
git add examples/skill-version-eval/src/fetcher.ts examples/skill-version-eval/src/fetcher.test.ts
git commit -m "feat(skill-version-eval): add GITHUB_TOKEN auth + enriched 401 errors (T13)"
```

---

## Task 2: T14 — Define ExplainInput/ExplainResult types in schemas

**Files:**
- Create: `packages/schemas/src/explain.ts`
- Modify: `packages/schemas/src/index.ts:104` (add after guard exports)

- [ ] **Step 1: Create the explain types file**

Create `packages/schemas/src/explain.ts`:

```typescript
import { z } from "zod";

// ── Normalized Vote ────────────────────────────────────────────────
// Common shape that both GuardVote and ReviewResult normalize into.

export const normalizedVoteSchema = z.object({
  evaluator: z.string(),
  score: z.number().min(0).max(1),
  rationale: z.string(),
  vote: z.enum(["YES", "NO", "REWRITE"]).optional(),
  weight: z.number().optional(),
  reputation: z.number().optional(),
});
export type NormalizedVote = z.infer<typeof normalizedVoteSchema>;

// ── Explain Input ──────────────────────────────────────────────────
// Accepts either guard or wrapper decision data.

export const explainInputSchema = z.object({
  /** The audit_id linking to stored audit events. Optional if votes are provided inline. */
  auditId: z.string().optional(),
  /** Final decision (guard path). */
  decision: z.enum(["ALLOW", "BLOCK", "REWRITE", "REQUIRE_HUMAN", "allow", "block", "retry", "escalate"]).optional(),
  /** Overall risk score (0-1). */
  riskScore: z.number().min(0).max(1).optional(),
  /** Normalized votes — caller can provide pre-normalized or let explainDecision() normalize. */
  votes: z.array(normalizedVoteSchema).optional(),
  /** Policy context for explaining thresholds. */
  policy: z.object({
    quorum: z.number().optional(),
    riskThreshold: z.number().optional(),
    strategy: z.string().optional(),
    threshold: z.number().optional(),
  }).optional(),
  /** Human-readable label for what was being decided. */
  actionLabel: z.string().optional(),
  /** The guard type (e.g., "send_email", "code_merge"). */
  guardType: z.string().optional(),
});
export type ExplainInput = z.infer<typeof explainInputSchema>;

// ── Explain Result ─────────────────────────────────────────────────

export const explainResultSchema = z.object({
  status: z.enum(["ok", "error"]),
  /** Human-readable narrative explanation. Present when status is "ok". */
  narrative: z.string().optional(),
  /** Error message. Present when status is "error". */
  error: z.string().optional(),
  /** The audit ID this explanation refers to. */
  auditId: z.string().optional(),
});
export type ExplainResult = z.infer<typeof explainResultSchema>;
```

- [ ] **Step 2: Add re-exports to schemas/src/index.ts**

Add after the Guard section (after line 130) in `packages/schemas/src/index.ts`:

```typescript
// ── Explain ──────────────────────────────────────────────────────
export {
  normalizedVoteSchema,
  type NormalizedVote,
  explainInputSchema,
  type ExplainInput,
  explainResultSchema,
  type ExplainResult,
} from "./explain.js";
```

- [ ] **Step 3: Verify types compile**

Run: `cd consensus-tools && pnpm --filter @consensus-tools/schemas typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/schemas/src/explain.ts packages/schemas/src/index.ts
git commit -m "feat(schemas): add ExplainInput, ExplainResult, NormalizedVote types (T14)"
```

---

## Task 3: T14 — Implement explainDecision() in core

**Files:**
- Create: `packages/core/src/explain.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create the explain module**

Create `packages/core/src/explain.ts`:

```typescript
import type {
  ExplainInput,
  ExplainResult,
  NormalizedVote,
  GuardResult,
  GuardVote,
} from "@consensus-tools/schemas";

// Inline type matching wrapper's ReviewResult to avoid circular dependency
// (wrapper depends on core via schemas, so core cannot import from wrapper).
interface ReviewResultLike {
  score: number;
  rationale?: string;
  block?: boolean;
}

/**
 * LLM callback type — caller provides their own LLM integration.
 * The function receives a fully-formed prompt string and returns the narrative text.
 */
export type LlmFn = (prompt: string) => Promise<string>;

export interface ExplainOptions {
  /** The LLM function to generate the narrative. */
  llm: LlmFn;
  /** Optional callback invoked with the prompt before sending to LLM. For debugging/logging. */
  onPrompt?: (prompt: string) => void;
}

/**
 * Normalize a GuardVote into the common NormalizedVote shape.
 */
export function normalizeGuardVote(v: GuardVote): NormalizedVote {
  return {
    evaluator: v.evaluator,
    score: v.vote === "YES" ? 1 - v.risk : v.vote === "REWRITE" ? 0.5 : v.risk,
    rationale: v.reason,
    vote: v.vote,
  };
}

/**
 * Normalize a ReviewResult into the common NormalizedVote shape.
 * ReviewResults don't have named evaluators, so we assign "reviewer-N".
 */
export function normalizeReviewResult(r: ReviewResultLike, index: number): NormalizedVote {
  return {
    evaluator: `reviewer-${index + 1}`,
    score: r.score,
    rationale: r.rationale ?? "(no rationale provided)",
  };
}

/**
 * Build a GuardResult into an ExplainInput with normalized votes.
 */
export function guardResultToExplainInput(result: GuardResult): ExplainInput {
  return {
    auditId: result.audit_id,
    decision: result.decision,
    riskScore: result.risk_score,
    votes: (result.votes ?? []).map(normalizeGuardVote),
    guardType: result.guard_type,
  };
}

const MAX_VOTES_IN_PROMPT = 20;

function buildPrompt(input: ExplainInput): string {
  const votes = input.votes ?? [];
  const truncated = votes.length > MAX_VOTES_IN_PROMPT;
  const displayVotes = truncated ? votes.slice(0, MAX_VOTES_IN_PROMPT) : votes;

  const voteSummary = displayVotes
    .map((v, i) => {
      const parts = [`  ${i + 1}. ${v.evaluator}: score=${v.score.toFixed(2)}`];
      if (v.vote) parts.push(`vote=${v.vote}`);
      if (v.weight !== undefined) parts.push(`weight=${v.weight}`);
      if (v.reputation !== undefined) parts.push(`reputation=${v.reputation}`);
      parts.push(`\n     Rationale: ${v.rationale}`);
      return parts.join(", ");
    })
    .join("\n");

  const policySection = input.policy
    ? `\nPolicy configuration:\n${JSON.stringify(input.policy, null, 2)}`
    : "";

  const truncationNote = truncated
    ? `\n(Showing top ${MAX_VOTES_IN_PROMPT} of ${votes.length} total votes)\n`
    : "";

  return `You are an audit trail explainer for a consensus decision system. Your job is to read structured decision data and produce a clear, human-readable narrative that a non-technical stakeholder (e.g., compliance officer) can understand.

Only reference data explicitly provided below. Do not infer or fabricate details that are not present in the data.

Decision summary:
- Decision: ${input.decision ?? "unknown"}
- Risk score: ${input.riskScore !== undefined ? input.riskScore.toFixed(2) : "not available"}
- Guard type: ${input.guardType ?? "not specified"}
- Action: ${input.actionLabel ?? "not specified"}
- Audit ID: ${input.auditId ?? "not available"}
${policySection}

Individual votes (${votes.length} total):${truncationNote}
${voteSummary || "  (no votes recorded)"}

Write a 2-4 paragraph explanation covering:
1. What was being decided and the outcome
2. How the individual reviewers voted and their key reasons
3. How the votes combined to reach the final decision (reference policy thresholds if provided)
4. Any notable risk factors or disagreements

Use plain language. Avoid jargon. Write as if explaining to someone who has never seen this system before.`;
}

/**
 * Generate a human-readable explanation of a consensus decision.
 *
 * Data flow:
 *   ExplainInput → normalize votes → build prompt → LLM callback → ExplainResult
 *
 * Error handling:
 *   - No votes → returns error result
 *   - LLM throws → catches and returns error result
 *   - LLM returns empty → returns error result
 */
export async function explainDecision(
  input: ExplainInput,
  opts: ExplainOptions,
): Promise<ExplainResult> {
  // Validate we have something to explain
  const votes = input.votes ?? [];
  if (votes.length === 0 && !input.decision) {
    return {
      status: "error",
      error: "No vote data or decision to explain",
      auditId: input.auditId,
    };
  }

  const prompt = buildPrompt(input);

  // Invoke optional observability callback
  if (opts.onPrompt) {
    opts.onPrompt(prompt);
  }

  let narrative: string;
  try {
    narrative = await opts.llm(prompt);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      error: `LLM call failed: ${message}`,
      auditId: input.auditId,
    };
  }

  // Validate LLM response
  if (!narrative || narrative.trim().length === 0) {
    return {
      status: "error",
      error: "LLM returned empty response",
      auditId: input.auditId,
    };
  }

  return {
    status: "ok",
    narrative: narrative.trim(),
    auditId: input.auditId,
  };
}
```

- [ ] **Step 2: Re-export from core/src/index.ts**

Add after the Util section (after line 44) in `packages/core/src/index.ts`:

```typescript
// ── Explain ──────────────────────────────────────────────────────
export {
  explainDecision,
  normalizeGuardVote,
  normalizeReviewResult,
  guardResultToExplainInput,
} from "./explain.js";
export type { LlmFn, ExplainOptions } from "./explain.js";
```

- [ ] **Step 3: Verify types compile**

The `ReviewResultLike` inline type is used instead of importing from `@consensus-tools/wrapper` to avoid a circular dependency (wrapper depends on core via schemas).

Run: `cd consensus-tools && pnpm --filter @consensus-tools/core typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/explain.ts packages/core/src/index.ts
git commit -m "feat(core): add explainDecision() with vote normalization and LLM prompt (T14)"
```

---

## Task 4: T14 — Unit tests for explainDecision()

**Files:**
- Create: `packages/core/tests/explain.test.ts`

- [ ] **Step 1: Write the test file**

Create `packages/core/tests/explain.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  explainDecision,
  normalizeGuardVote,
  normalizeReviewResult,
  guardResultToExplainInput,
} from "../src/explain.js";
import type { ExplainInput, GuardVote, GuardResult } from "@consensus-tools/schemas";

// ── normalizeGuardVote ──────────────────────────────────────────

describe("normalizeGuardVote", () => {
  it("normalizes a YES vote", () => {
    const vote: GuardVote = { evaluator: "safety-reviewer", vote: "YES", reason: "Looks safe", risk: 0.2 };
    const result = normalizeGuardVote(vote);
    expect(result.evaluator).toBe("safety-reviewer");
    expect(result.score).toBe(0.8); // 1 - risk for YES
    expect(result.rationale).toBe("Looks safe");
    expect(result.vote).toBe("YES");
  });

  it("normalizes a NO vote", () => {
    const vote: GuardVote = { evaluator: "security-gatekeeper", vote: "NO", reason: "Too risky", risk: 0.9 };
    const result = normalizeGuardVote(vote);
    expect(result.evaluator).toBe("security-gatekeeper");
    expect(result.score).toBe(0.9); // risk value for NO
    expect(result.vote).toBe("NO");
  });

  it("normalizes a REWRITE vote to 0.5 score", () => {
    const vote: GuardVote = { evaluator: "editor", vote: "REWRITE", reason: "Needs changes", risk: 0.4 };
    const result = normalizeGuardVote(vote);
    expect(result.score).toBe(0.5);
    expect(result.vote).toBe("REWRITE");
  });
});

// ── normalizeReviewResult ───────────────────────────────────────

describe("normalizeReviewResult", () => {
  it("normalizes a ReviewResult with rationale", () => {
    const result = normalizeReviewResult({ score: 0.85, rationale: "Good output" }, 0);
    expect(result.evaluator).toBe("reviewer-1");
    expect(result.score).toBe(0.85);
    expect(result.rationale).toBe("Good output");
  });

  it("handles missing rationale", () => {
    const result = normalizeReviewResult({ score: 0.3 }, 2);
    expect(result.evaluator).toBe("reviewer-3");
    expect(result.rationale).toBe("(no rationale provided)");
  });
});

// ── guardResultToExplainInput ───────────────────────────────────

describe("guardResultToExplainInput", () => {
  it("converts a GuardResult to ExplainInput", () => {
    const guardResult: GuardResult = {
      decision: "BLOCK",
      reason: "High risk",
      risk_score: 0.85,
      audit_id: "test-audit-123",
      votes: [
        { evaluator: "safety", vote: "NO", reason: "Dangerous", risk: 0.9 },
        { evaluator: "compliance", vote: "YES", reason: "Compliant", risk: 0.2 },
      ],
      guard_type: "send_email",
    };

    const input = guardResultToExplainInput(guardResult);
    expect(input.auditId).toBe("test-audit-123");
    expect(input.decision).toBe("BLOCK");
    expect(input.riskScore).toBe(0.85);
    expect(input.guardType).toBe("send_email");
    expect(input.votes).toHaveLength(2);
    expect(input.votes![0].evaluator).toBe("safety");
    expect(input.votes![1].evaluator).toBe("compliance");
  });

  it("handles GuardResult with no votes", () => {
    const guardResult: GuardResult = {
      decision: "ALLOW",
      reason: "Low risk",
      risk_score: 0.1,
      audit_id: "test-audit-456",
    };

    const input = guardResultToExplainInput(guardResult);
    expect(input.votes).toEqual([]);
  });
});

// ── explainDecision ─────────────────────────────────────────────

describe("explainDecision", () => {
  const mockLlm = vi.fn<(prompt: string) => Promise<string>>();

  const sampleInput: ExplainInput = {
    auditId: "audit-abc",
    decision: "BLOCK",
    riskScore: 0.85,
    guardType: "send_email",
    votes: [
      { evaluator: "safety-reviewer", score: 0.9, rationale: "Recipient not verified", vote: "NO" },
      { evaluator: "compliance-checker", score: 0.7, rationale: "Missing opt-out link", vote: "NO" },
      { evaluator: "content-reviewer", score: 0.3, rationale: "Content looks fine", vote: "YES" },
    ],
    policy: { quorum: 0.7, riskThreshold: 0.7 },
  };

  it("returns ok with narrative on successful LLM call", async () => {
    mockLlm.mockResolvedValueOnce("The email was blocked because 2 of 3 reviewers flagged it as high-risk.");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("ok");
    expect(result.narrative).toBe("The email was blocked because 2 of 3 reviewers flagged it as high-risk.");
    expect(result.auditId).toBe("audit-abc");
  });

  it("returns error when LLM throws", async () => {
    mockLlm.mockRejectedValueOnce(new Error("API timeout"));

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toContain("LLM call failed");
    expect(result.error).toContain("API timeout");
    expect(result.auditId).toBe("audit-abc");
  });

  it("returns error when LLM returns empty string", async () => {
    mockLlm.mockResolvedValueOnce("");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toBe("LLM returned empty response");
  });

  it("returns error when LLM returns whitespace-only", async () => {
    mockLlm.mockResolvedValueOnce("   \n  ");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toBe("LLM returned empty response");
  });

  it("returns error when no votes and no decision provided", async () => {
    const result = await explainDecision({ votes: [] }, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toBe("No vote data or decision to explain");
  });

  it("succeeds with decision but no votes", async () => {
    mockLlm.mockResolvedValueOnce("The action was allowed with no recorded votes.");

    const result = await explainDecision(
      { decision: "ALLOW", riskScore: 0.1 },
      { llm: mockLlm },
    );
    expect(result.status).toBe("ok");
  });

  it("calls onPrompt callback with the prompt text", async () => {
    mockLlm.mockResolvedValueOnce("Explanation here.");
    const onPrompt = vi.fn();

    await explainDecision(sampleInput, { llm: mockLlm, onPrompt });
    expect(onPrompt).toHaveBeenCalledOnce();
    const prompt = onPrompt.mock.calls[0][0];
    expect(prompt).toContain("audit trail explainer");
    expect(prompt).toContain("BLOCK");
    expect(prompt).toContain("safety-reviewer");
    expect(prompt).toContain("Recipient not verified");
  });

  it("includes policy context in prompt when provided", async () => {
    mockLlm.mockResolvedValueOnce("Explanation with policy.");
    const onPrompt = vi.fn();

    await explainDecision(sampleInput, { llm: mockLlm, onPrompt });
    const prompt = onPrompt.mock.calls[0][0];
    expect(prompt).toContain("quorum");
    expect(prompt).toContain("0.7");
  });

  it("trims narrative whitespace", async () => {
    mockLlm.mockResolvedValueOnce("\n  The decision was made.  \n\n");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.narrative).toBe("The decision was made.");
  });

  it("handles non-Error throw from LLM", async () => {
    mockLlm.mockRejectedValueOnce("string error");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toContain("string error");
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd consensus-tools && pnpm --filter @consensus-tools/core test`
Expected: All existing tests + new explain tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/explain.test.ts
git commit -m "test(core): add unit tests for explainDecision and vote normalization (T14)"
```

---

## Task 5: T14 — Add audit.explain MCP tool

**Files:**
- Modify: `packages/adapters/mcp/src/tools/board-tools.ts`

- [ ] **Step 1: Add the tool definition to the tools array**

Add after the `audit.search` tool definition (after line 48) in `packages/adapters/mcp/src/tools/board-tools.ts`:

```typescript
  {
    name: "audit.explain",
    description:
      "Generate a human-readable explanation of a guard decision. Requires an LLM — set ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment.",
    inputSchema: {
      type: "object" as const,
      properties: {
        auditId: {
          type: "string",
          description: "The audit_id from a GuardResult to explain",
        },
      },
      required: ["auditId"],
    },
  },
```

- [ ] **Step 2: Add the handler case**

Add the `audit.explain` case in the `handle()` switch statement (before the `default:` case) in `board-tools.ts`:

```typescript
      case "audit.explain": {
        if (!args.auditId) {
          return { isError: true, content: [{ type: "text", text: "auditId is required" }] };
        }
        const auditId = args.auditId as string;
        const state = await ctx.storage.getState();

        // Find the guard result by audit_id
        const guardResult = state.guardResults.find((r) => r.audit_id === auditId);
        if (!guardResult) {
          return {
            isError: true,
            content: [{ type: "text", text: `No guard result found for audit ID: ${auditId}` }],
          };
        }

        // Check for an LLM API key
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!anthropicKey && !openaiKey) {
          return {
            isError: true,
            content: [{ type: "text", text: "Set ANTHROPIC_API_KEY or OPENAI_API_KEY to use audit.explain" }],
          };
        }

        // Dynamic import to avoid hard dependency
        const { explainDecision, guardResultToExplainInput } = await import("@consensus-tools/core");

        const input = guardResultToExplainInput(guardResult);
        const llm = await createLlmFn(anthropicKey, openaiKey);
        const result = await explainDecision(input, { llm });

        if (result.status === "error") {
          return { isError: true, content: [{ type: "text", text: result.error! }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ auditId, narrative: result.narrative }) }],
        };
      }
```

- [ ] **Step 3: Add the createLlmFn helper at the bottom of board-tools.ts**

Add this helper function at the end of the file (after the `handle` function):

```typescript
async function createLlmFn(
  anthropicKey: string | undefined,
  openaiKey: string | undefined,
): Promise<(prompt: string) => Promise<string>> {
  if (anthropicKey) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicKey });
    return async (prompt: string) => {
      const res = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const block = res.content[0];
      return block.type === "text" ? block.text : "";
    };
  }

  // Fallback to OpenAI
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: openaiKey });
  return async (prompt: string) => {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    });
    return res.choices[0]?.message?.content ?? "";
  };
}
```

**Required:** Add `@anthropic-ai/sdk` and `openai` as optional dependencies so TypeScript can resolve the dynamic imports:

```bash
cd consensus-tools/packages/adapters/mcp
pnpm add @anthropic-ai/sdk openai
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd consensus-tools && pnpm --filter @consensus-tools/mcp typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/mcp/src/tools/board-tools.ts packages/adapters/mcp/package.json
git commit -m "feat(mcp): add audit.explain tool for human-readable decision explanations (T14)"
```

---

## Task 6: T14 — Add CLI explain command

**Files:**
- Modify: `packages/cli/src/commands.ts`

- [ ] **Step 1: Add the explain command**

Add before the `return program;` line (before line 171) in `packages/cli/src/commands.ts`:

```typescript
  // explain
  program.command("explain <auditId>")
    .description("Explain a guard decision in plain language (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)")
    .option("--json", "JSON output")
    .option("--verbose", "Print the prompt sent to the LLM")
    .action(async (auditId: string, opts) => {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!anthropicKey && !openaiKey) {
        console.error("Error: Set ANTHROPIC_API_KEY or OPENAI_API_KEY to use explain.");
        process.exit(1);
      }

      // Load local storage to find the guard result
      const { JsonStorage, explainDecision, guardResultToExplainInput } = await import("@consensus-tools/core");
      const cfg = await loadCliConfig();
      const storagePath = (cfg as any).boards?.local?.storagePath ?? "./data/local-board.json";
      const storage = new JsonStorage(storagePath);
      await storage.init();

      const state = await storage.getState();
      const guardResult = state.guardResults.find((r) => r.audit_id === auditId);
      if (!guardResult) {
        console.error(`Error: No guard result found for audit ID: ${auditId}`);
        process.exit(1);
      }

      const input = guardResultToExplainInput(guardResult);

      // Build LLM function
      let llm: (prompt: string) => Promise<string>;
      if (anthropicKey) {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: anthropicKey });
        llm = async (prompt: string) => {
          const res = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          });
          const block = res.content[0];
          return block.type === "text" ? block.text : "";
        };
      } else {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey: openaiKey });
        llm = async (prompt: string) => {
          const res = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1024,
          });
          return res.choices[0]?.message?.content ?? "";
        };
      }

      const onPrompt = opts.verbose ? (prompt: string) => console.error("[prompt]\n" + prompt + "\n") : undefined;
      const result = await explainDecision(input, { llm, onPrompt });

      if (result.status === "error") {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      if (opts.json) {
        output(result, true);
      } else {
        console.log(result.narrative);
      }
    });
```

- [ ] **Step 2: Add SDK dependencies to CLI package**

```bash
cd consensus-tools/packages/cli
pnpm add @anthropic-ai/sdk openai
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd consensus-tools && pnpm --filter @consensus-tools/cli typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands.ts packages/cli/package.json
git commit -m "feat(cli): add 'explain <auditId>' command for human-readable decision narratives (T14)"
```

---

## Task 7: Update TODOS.md

**Files:**
- Modify: `TODOS.md`

- [ ] **Step 1: Mark T13 as done**

In `TODOS.md`, replace the T13 section header and first line:

```markdown
## ~~T13: Skill version eval — GitHub API authentication~~ DONE (2026-03-20)

Added `GITHUB_TOKEN` env var support to `githubFetch()` in skill-version-eval. Authenticated requests get 5,000 req/hr (vs 60 unauthenticated). Includes enriched 401 error messages when token is invalid.
```

- [ ] **Step 2: Mark T14 as done**

In `TODOS.md`, replace the T14 section header and first line:

```markdown
## ~~T14: AI-Powered Audit Explainer~~ DONE (2026-03-20)

Shipped `explainDecision()` in `@consensus-tools/core` — normalizes GuardVote and ReviewResult into common shape, builds a structured prompt, calls user-provided LLM callback, returns narrative or error. Exposed via MCP tool (`audit.explain`) and CLI command (`consensus-tools explain <auditId>`). Supports Anthropic and OpenAI providers via dynamic import.
```

- [ ] **Step 3: Update the priority order block at the top**

Update the priority block to remove T13 and T14:

```
P0: ~~T11 (Unify Personas)~~ → ~~T10 (/consensus-engineer)~~
P2: T7 (Guard Playground), T9 (Audit View)
P3: T1, T2, T5, T6 (tech debt + demo tooling), T15 (Bun→vitest migration)
P4: T3, T4, T8, T12 (deferred / blocked)
```

- [ ] **Step 4: Commit**

```bash
git add TODOS.md
git commit -m "docs: mark T13 and T14 as done in TODOS.md"
```

---

## Task 8: Build and verify

- [ ] **Step 1: Build all packages**

Run: `cd consensus-tools && pnpm build`
Expected: All packages build successfully

- [ ] **Step 2: Run all tests**

Run: `cd consensus-tools && pnpm test`
Expected: All tests pass

- [ ] **Step 3: Run T13 tests specifically**

Run: `cd consensus-tools/examples/skill-version-eval && bun test`
Expected: All fetcher tests pass (existing + 4 new auth tests)

- [ ] **Step 4: Run typecheck**

Run: `cd consensus-tools && pnpm typecheck`
Expected: No type errors

- [ ] **Step 5: Final commit if any fixups were needed**

Only if previous steps required fixes. Otherwise skip.

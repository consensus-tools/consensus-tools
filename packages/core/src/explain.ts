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

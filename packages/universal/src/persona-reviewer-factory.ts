import crypto from "node:crypto";
import { resolveConsensus } from "@consensus-tools/core";
import { createGuardTemplate, GUARD_CONFIGS } from "@consensus-tools/guards";
import type { PersonaConfig, EvalPersonaConfig } from "@consensus-tools/personas";
import type { ConsensusInput, ConsensusResult } from "@consensus-tools/schemas";
import type { ModelAdapter, ModelMessage, LlmDecisionResult } from "./types.js";
import type { ReputationManager } from "./reputation-manager.js";
import { classifyTool } from "./risk-tiers.js";
import type { RiskTierMap } from "./types.js";

// ── Unified Deliberation Pipeline ────────────────────────────────────
// Single pre-execution gating pipeline shared by both regex-only mode
// (no model) and LLM persona mode (model provided).
//
// Architecture:
//   1. Regex pre-screen (sub-ms, deterministic)
//   2. Risk tier check (low = fast-path)
//   3. Vote collection — branches on config.model:
//        - LLM mode:   parallel LLM calls per persona (timeout + fallback)
//        - Regex mode: per-persona guard evaluation using persona.role
//   4. Synthesize ConsensusInput: ONE "allow" submission, all personas
//      vote on it (YES = +1, NO = -1). resolveConsensus aggregates.
//   5. Determine action from consensus result
//   6. Return LlmDecisionResult

// ── Safe JSON Serialization ──────────────────────────────────────────

function safeStringify(obj: unknown, indent?: number): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  }, indent);
}

// ── Vote Parsing ─────────────────────────────────────────────────────

interface ParsedVote {
  vote: "YES" | "NO" | "REWRITE";
  confidence: number;
  rationale: string;
  /** Hard-block flag — see LlmDecisionResult.votes[].block in types.ts. */
  block?: boolean;
}

/** Risk threshold above which a regex-mode NO vote becomes a hard-block veto. */
const HARD_BLOCK_RISK_THRESHOLD = 0.8;

// Match VOTE: YES/NO/REWRITE on its own line (anchored to reduce injection risk)
const VOTE_LINE_PATTERN = /^(?:VOTE:\s*)?(YES|NO|REWRITE)\s*$/im;
// Fallback: match anywhere but only as a last resort
const VOTE_FALLBACK_PATTERN = /\b(YES|NO|REWRITE)\b/i;
const CONFIDENCE_PATTERN = /confidence[:\s]*([0-9]*\.?[0-9]+)/i;

function parseVoteFromLlm(response: string): ParsedVote | null {
  // Prefer line-anchored match (harder to inject)
  const lineMatch = response.match(VOTE_LINE_PATTERN);
  const voteMatch = lineMatch ?? response.match(VOTE_FALLBACK_PATTERN);
  if (!voteMatch) return null;

  const vote = voteMatch[1]!.toUpperCase() as "YES" | "NO" | "REWRITE";
  const confMatch = response.match(CONFIDENCE_PATTERN);
  const confidence = confMatch?.[1] ? Math.min(1, Math.max(0, parseFloat(confMatch[1]))) : 0.5;

  const rationale = response
    .replace(/^.*\b(YES|NO|REWRITE)\b.*$/im, "")
    .replace(/^.*confidence.*$/im, "")
    .trim()
    .slice(0, 500) || "No rationale provided";

  return { vote, confidence, rationale };
}

// ── Prompt Construction ──────────────────────────────────────────────

function buildPersonaPrompt(
  persona: PersonaConfig,
  toolName: string,
  args: Record<string, unknown>,
  regexSignals: string[],
): ModelMessage[] {
  const evalPersona = persona as Partial<EvalPersonaConfig>;
  const systemPrompt = evalPersona.systemPrompt ??
    `You are a ${persona.role} reviewer named ${persona.name}.` +
    (persona.bias ? ` Your bias: ${persona.bias}.` : "") +
    (persona.non_negotiables?.length
      ? ` Non-negotiables: ${persona.non_negotiables.join(", ")}.`
      : "") +
    (persona.failure_modes?.length
      ? ` Watch for: ${persona.failure_modes.join(", ")}.`
      : "") +
    ` Respond ONLY with a VOTE line, CONFIDENCE line, and RATIONALE line. Do not echo the tool arguments.`;

  const regexContext = regexSignals.length > 0
    ? `\n\nRegex pre-screen detected these signals:\n${regexSignals.map((s) => `- ${s}`).join("\n")}`
    : "\n\nRegex pre-screen: no pattern matches detected.";

  // Sanitize args: truncate to prevent prompt stuffing, use safe serialization
  const argsStr = safeStringify(args, 2).slice(0, 2000);

  const userPrompt =
    `Evaluate this tool call for risks:\n\n` +
    `Tool: ${toolName}\n` +
    `Arguments:\n${argsStr}\n` +
    regexContext +
    `\n\nRespond with exactly these three lines:\n` +
    `VOTE: YES (safe to proceed), NO (block this action), or REWRITE (needs modification)\n` +
    `CONFIDENCE: 0.0 to 1.0\n` +
    `RATIONALE: Brief explanation of your decision`;

  return [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];
}

// ── Regex Pre-Screen ─────────────────────────────────────────────────

// Fallback guard domains when configured guards have no matching configs
const FALLBACK_GUARDS = ["security", "compliance", "user-impact"];

function runRegexPreScreen(
  toolName: string,
  args: Record<string, unknown>,
  guards: string[],
): string[] {
  const signals: string[] = [];
  // Use provided guards, falling back to DEFAULT_PERSONA_TRIO
  const effectiveGuards = guards.filter((g) => GUARD_CONFIGS[g]).length > 0
    ? guards
    : FALLBACK_GUARDS;

  for (const domain of effectiveGuards) {
    const config = GUARD_CONFIGS[domain];
    if (!config) continue;

    try {
      const template = createGuardTemplate(domain, config);
      const votes = template.evaluate({
        boardId: "facade",
        action: { type: toolName, payload: args },
      });

      for (const vote of votes) {
        if (vote.vote === "NO" || (vote.risk && vote.risk > 0.5)) {
          signals.push(`[${domain}] ${vote.reason} (risk: ${vote.risk ?? "unknown"})`);
        }
      }
    } catch {
      // Regex pre-screen failure is non-fatal
    }
  }

  return signals;
}

// ── LLM Call with Timeout ────────────────────────────────────────────

async function callLlmWithTimeout(
  model: ModelAdapter,
  messages: ModelMessage[],
  timeoutMs: number,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      model(messages),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("LLM call timed out")), timeoutMs);
      }),
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Regex Fallback Vote ──────────────────────────────────────────────

function regexFallbackVote(
  _persona: PersonaConfig,
  toolName: string,
  args: Record<string, unknown>,
  guards: string[],
): ParsedVote {
  const signals = runRegexPreScreen(toolName, args, guards);
  if (signals.length > 0) {
    return {
      vote: "NO",
      confidence: 0.6,
      rationale: `Regex fallback: ${signals.join("; ")}`,
    };
  }
  // When LLM is unavailable AND regex finds nothing, default to block for safety.
  // This prevents fail-open when all LLMs are down.
  return {
    vote: "NO",
    confidence: 0.3,
    rationale: "Regex fallback: no pattern matches but LLM unavailable (fail-closed)",
  };
}

// ── Regex-Mode Vote (no LLM configured) ──────────────────────────────
// Each persona in regex mode is keyed by a guard domain (persona.role).
// Evaluate that domain's guard against the call and produce a vote.
// Differs from regexFallbackVote: this is the *primary* vote source when
// no model is configured, not a fallback after LLM failure.

function regexModeVote(
  persona: PersonaConfig,
  toolName: string,
  args: Record<string, unknown>,
): ParsedVote {
  const domain = persona.role;
  const config = GUARD_CONFIGS[domain];
  if (!config) {
    // Defense in depth: if the persona's domain isn't a known guard, run the
    // fallback guards (security/compliance/user-impact) instead of fail-safe YES.
    // Rationale: silently allowing unknown guards turned the default config
    // into a rubber stamp before this fix shipped — never again.
    const signals = runRegexPreScreen(toolName, args, FALLBACK_GUARDS);
    if (signals.length > 0) {
      // Treat any fallback-flagged signal as a hard-block. We can't read the
      // raw risk values from the signal strings here, so be conservative —
      // unknown-guard configurations should not be a way to soften governance.
      return {
        vote: "NO",
        confidence: 0.7,
        rationale: `Unknown guard "${domain}"; fallback guards flagged: ${signals.join("; ")}`,
        block: true,
      };
    }
    return {
      vote: "YES",
      confidence: 0.4,
      rationale: `Unknown guard "${domain}"; fallback guards found no risk signals`,
    };
  }

  try {
    const template = createGuardTemplate(domain, config);
    const votes = template.evaluate({
      boardId: "facade",
      action: { type: toolName, payload: args },
    });

    const blocking = votes.filter((v) => v.vote === "NO" || (v.risk && v.risk > 0.5));
    const rewrites = votes.filter((v) => v.vote === "REWRITE");

    if (blocking.length > 0) {
      // Hard-block veto: any NO with high risk (or hardBlock pattern match) overrides
      // policy. This preserves the old wrapper semantic where any reviewer with
      // block:true forced an immediate block. Without this, security saying NO at
      // risk 0.9 gets outvoted by two unrelated guards saying YES under majority.
      const isHardBlock = blocking.some(
        (v) =>
          v.evaluator?.endsWith("-hardblock") ||
          (v.vote === "NO" && (v.risk ?? 0) >= HARD_BLOCK_RISK_THRESHOLD),
      );
      return {
        vote: "NO",
        confidence: 0.7,
        rationale: blocking.map((v) => v.reason).filter(Boolean).join("; ") || `[${domain}] flagged risk`,
        ...(isHardBlock && { block: true }),
      };
    }
    if (rewrites.length > 0) {
      return {
        vote: "REWRITE",
        confidence: 0.6,
        rationale: rewrites.map((v) => v.reason).filter(Boolean).join("; ") || `[${domain}] suggested rewrite`,
      };
    }
    return { vote: "YES", confidence: 0.5, rationale: `[${domain}] no signals` };
  } catch (err) {
    return {
      vote: "YES",
      confidence: 0.3,
      rationale: `Guard "${domain}" crashed: ${err instanceof Error ? err.message : String(err)} — fail-safe YES`,
    };
  }
}

// ── Factory ──────────────────────────────────────────────────────────

export interface PersonaReviewerConfig {
  /**
   * Optional LLM adapter. When provided, personas vote via LLM calls.
   * When omitted, personas vote via regex evaluation of `persona.role`
   * (which must match a guard domain in GUARD_CONFIGS).
   */
  model?: ModelAdapter;
  pack?: string;
  personas?: PersonaConfig[];
  guards?: string[];
  policyType: string;
  originalPolicy: string;
  riskTiers?: RiskTierMap;
  reputationManager: ReputationManager;
  timeoutMs: number;
}

// Policies that use voteBased() in resolveConsensus — score-based action.
const VOTE_BASED_POLICIES = new Set([
  "MAJORITY_VOTE",
  "WEIGHTED_VOTE_SIMPLE",
  "WEIGHTED_REPUTATION",
]);

// Compute minScore for APPROVAL_VOTE from user-facing policy string.
// Vote scores: YES=+1, NO=-1, REWRITE=0. Range: [-N, +N].
// Formula: minScore = N * (2 * threshold - 1)
function computeApprovalMinScore(originalPolicy: string, personaCount: number): number {
  if (originalPolicy === "unanimous") return personaCount;
  if (originalPolicy === "supermajority") return personaCount * (2 * 0.67 - 1);
  if (originalPolicy.startsWith("threshold:")) {
    const threshold = parseFloat(originalPolicy.slice("threshold:".length));
    if (!Number.isNaN(threshold)) return personaCount * (2 * threshold - 1);
  }
  // Default for unmapped APPROVAL_VOTE: simple majority (any net positive)
  return 0.01;
}

function determineAction(
  voteResults: Array<{ vote: "YES" | "NO" | "REWRITE" }>,
  consensusResult: ConsensusResult,
  submissionId: string,
  policyType: string,
): "allow" | "block" | "escalate" {
  // 1. Rewrite majority → escalate (universal override)
  const rewriteCount = voteResults.filter((v) => v.vote === "REWRITE").length;
  if (rewriteCount > voteResults.length / 2) return "escalate";

  // 2. APPROVAL_VOTE: has built-in threshold checks. Empty winners = block.
  if (policyType === "APPROVAL_VOTE") {
    return consensusResult.winningSubmissionIds.length > 0 ? "allow" : "block";
  }

  // 3. voteBased policies: read score from consensus trace. Positive = allow.
  if (VOTE_BASED_POLICIES.has(policyType)) {
    const traceScores = consensusResult.consensusTrace?.scores as Record<string, number> | undefined;
    const score = traceScores?.[submissionId] ?? 0;
    return score > 0 ? "allow" : "block";
  }

  // 4. All other policies: fall back to raw vote counting.
  const yesCount = voteResults.filter((v) => v.vote === "YES").length;
  const noCount = voteResults.filter((v) => v.vote === "NO").length;
  return yesCount > noCount ? "allow" : "block";
}

/**
 * Run LLM persona deliberation on a tool call.
 *
 * Returns an LlmDecisionResult with per-persona votes, consensus trace,
 * and final action (allow/block/escalate).
 */
export async function deliberate(
  config: PersonaReviewerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<LlmDecisionResult> {
  const decisionId = `dec_${crypto.randomUUID().slice(0, 12)}`;
  const personas = config.reputationManager.getPersonas();
  const guards = config.guards ?? FALLBACK_GUARDS;

  // 1. Regex pre-screen
  const regexSignals = runRegexPreScreen(toolName, args, guards);

  // 2. Risk tier check
  const tier = classifyTool(toolName, config.riskTiers);
  if (tier === "low") {
    const hasRisk = regexSignals.length > 0;
    return {
      decisionId,
      action: hasRisk ? "block" : "allow",
      votes: personas.map((p) => ({
        personaId: p.id,
        personaName: p.name,
        vote: hasRisk ? ("NO" as const) : ("YES" as const),
        confidence: hasRisk ? 0.7 : 0.3,
        rationale: hasRisk
          ? `Fast-path regex: ${regexSignals.join("; ")}`
          : "Fast-path: low-risk tool, no regex signals",
        source: "regex_fallback" as const,
      })),
      policy: "fast_path",
      consensusTrace: { tier: "low", regexSignals },
      aggregateScore: hasRisk ? 0.0 : 1.0,
    };
  }

  // 3. Vote collection — branches on whether an LLM model is configured
  const voteResults = config.model
    ? await Promise.all(
        // LLM mode: parallel persona LLM calls with timeout + regex fallback
        personas.map(async (persona) => {
          const messages = buildPersonaPrompt(persona, toolName, args, regexSignals);

          try {
            const response = await callLlmWithTimeout(config.model!, messages, config.timeoutMs);
            const parsed = parseVoteFromLlm(response);

            if (parsed) {
              return {
                personaId: persona.id,
                personaName: persona.name,
                ...parsed,
                source: "llm" as const,
              };
            }

            const fallback = regexFallbackVote(persona, toolName, args, guards);
            return {
              personaId: persona.id,
              personaName: persona.name,
              ...fallback,
              source: "regex_fallback" as const,
            };
          } catch {
            const fallback = regexFallbackVote(persona, toolName, args, guards);
            return {
              personaId: persona.id,
              personaName: persona.name,
              ...fallback,
              source: "regex_fallback" as const,
            };
          }
        }),
      )
    : personas.map((persona) => {
        // Regex mode: evaluate persona.role's guard against the call.
        // Synchronous and deterministic, but mapped through Promise.all-shape.
        const vote = regexModeVote(persona, toolName, args);
        return {
          personaId: persona.id,
          personaName: persona.name,
          ...vote,
          source: "regex" as const,
        };
      });

  // Hard-block check: any vote with block:true vetoes the decision regardless
  // of policy. Preserves the old wrapper semantic where a single high-confidence
  // block forces an immediate block.
  const vetoVote = voteResults.find((v) => v.block);
  if (vetoVote) {
    config.reputationManager.recordDecision({
      decisionId,
      action: "block",
      votes: voteResults,
      policy: "hard_block",
      consensusTrace: { reason: "veto", vetoBy: vetoVote.personaName, regexSignals },
      aggregateScore: 0,
    });
    return {
      decisionId,
      action: "block",
      votes: voteResults,
      policy: "hard_block",
      consensusTrace: { reason: "veto", vetoBy: vetoVote.personaName, vetoRationale: vetoVote.rationale, regexSignals },
      aggregateScore: 0,
    };
  }

  // 4. Synthesize ConsensusInput for resolveConsensus()
  //
  // FIXED: Use a SINGLE "allow" submission. All personas vote on it.
  // YES voters score +1, NO voters score -1, REWRITE voters score 0.
  // This way resolveConsensus sees N votes on 1 submission, not N
  // submissions with 1 vote each.
  const now = new Date().toISOString();
  const jobId = `job_facade_${decisionId}`;
  const submissionId = `sub_${decisionId}_allow`;

  const job = {
    id: jobId,
    boardId: "",
    status: "SUBMITTED" as const,
    title: `Deliberation: ${toolName}`,
    description: "",
    createdByAgentId: "facade",
    createdAt: now,
    updatedAt: now,
    mode: "VOTING" as const,
    consensusPolicy: {
      type: config.policyType as any,
      ...(config.policyType === "APPROVAL_VOTE" ? {
        minScore: computeApprovalMinScore(config.originalPolicy, personas.length),
        minMargin: 0,
      } : {}),
    },
    stakeRequired: 0,
    reward: 0,
    maxParticipants: personas.length,
    minParticipants: 1,
  };

  // Single submission representing "allow this tool call"
  const submissions = [{
    id: submissionId,
    jobId,
    agentId: "facade",
    submittedAt: now,
    summary: `Allow ${toolName}`,
    artifacts: {},
    confidence: 1.0,
    requestedPayout: 0,
    status: "SUBMITTED" as const,
  }];

  // Each persona votes on the single submission
  const votes = voteResults.map((v, i) => ({
    id: `vote_${decisionId}_${i}`,
    jobId,
    agentId: v.personaId,
    submissionId,
    score: v.vote === "YES" ? 1 : v.vote === "NO" ? -1 : 0,
    weight: v.confidence,
    rationale: v.rationale,
    createdAt: now,
  }));

  const reputation = (agentId: string) =>
    config.reputationManager.getReputation(agentId);

  // 5. Resolve consensus
  const consensusInput: ConsensusInput = {
    job: job as any,
    submissions: submissions as any[],
    votes: votes as any[],
    reputation,
  };

  let consensusTrace: Record<string, unknown>;
  let consensusResult: ConsensusResult | null = null;

  try {
    const result: ConsensusResult = resolveConsensus(consensusInput);
    consensusResult = result;
    consensusTrace = result.consensusTrace;

    const traceScores = (consensusTrace as any)?.scores as Record<string, number> | undefined;
    const submissionScore = traceScores?.[submissionId] ?? 0;
    consensusTrace = { ...consensusTrace, submissionScore };
  } catch {
    consensusTrace = { policy: "fallback_majority", reason: "resolve_error" };
  }

  // 6. Determine action from consensus result (policy-aware)
  let action: "allow" | "block" | "escalate";
  if (consensusResult) {
    action = determineAction(voteResults, consensusResult, submissionId, config.policyType);
  } else {
    // resolveConsensus failed — fall back to raw vote counting
    const rewriteCount = voteResults.filter((v) => v.vote === "REWRITE").length;
    const yesCount = voteResults.filter((v) => v.vote === "YES").length;
    const noCount = voteResults.filter((v) => v.vote === "NO").length;
    if (rewriteCount > voteResults.length / 2) action = "escalate";
    else if (yesCount > noCount) action = "allow";
    else action = "block";
  }

  // Compute aggregate score
  const totalConfidence = voteResults.reduce((s, v) => s + v.confidence, 0);
  const yesConfidence = voteResults
    .filter((v) => v.vote === "YES")
    .reduce((s, v) => s + v.confidence, 0);
  const aggregateScore = totalConfidence > 0 ? yesConfidence / totalConfidence : 0.5;

  const result: LlmDecisionResult = {
    decisionId,
    action,
    votes: voteResults,
    policy: config.policyType,
    consensusTrace,
    aggregateScore,
  };

  config.reputationManager.recordDecision(result);

  return result;
}

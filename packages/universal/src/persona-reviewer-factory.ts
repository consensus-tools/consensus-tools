import crypto from "node:crypto";
import { resolveConsensus } from "@consensus-tools/core";
import { createGuardTemplate, GUARD_CONFIGS } from "@consensus-tools/guards";
import type { PersonaConfig, EvalPersonaConfig } from "@consensus-tools/personas";
import type { ConsensusInput, ConsensusResult } from "@consensus-tools/schemas";
import type { ModelAdapter, ModelMessage, LlmDecisionResult } from "./types.js";
import type { ReputationManager } from "./reputation-manager.js";
import { classifyTool } from "./risk-tiers.js";
import type { RiskTierMap } from "./types.js";

// ── Persona Reviewer Factory ─────────────────────────────────────────
// Creates LLM-backed persona reviewers that use resolveConsensus()
// for multi-model deliberation with reputation-weighted voting.
//
// Architecture:
//   1. Regex pre-screen (sub-ms, deterministic)
//   2. Risk tier check (low = fast-path regex only)
//   3. Parallel LLM calls per persona (with timeout + fallback)
//   4. Parse votes from LLM responses
//   5. Synthesize ConsensusInput: ONE "allow" submission, all personas
//      vote on it (YES = +1, NO = -1). resolveConsensus aggregates.
//   6. Determine action from consensus result
//   7. Return LlmDecisionResult

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
}

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

// ── Factory ──────────────────────────────────────────────────────────

export interface PersonaReviewerConfig {
  model: ModelAdapter;
  pack?: string;
  personas?: PersonaConfig[];
  guards?: string[];
  policyType: string;
  riskTiers?: RiskTierMap;
  reputationManager: ReputationManager;
  timeoutMs: number;
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

  // 3. Parallel LLM calls per persona (with timeout + fallback)
  const voteResults = await Promise.all(
    personas.map(async (persona) => {
      const messages = buildPersonaPrompt(persona, toolName, args, regexSignals);

      try {
        const response = await callLlmWithTimeout(config.model, messages, config.timeoutMs);
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
  );

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
    consensusPolicy: { type: config.policyType as any },
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

  try {
    const result: ConsensusResult = resolveConsensus(consensusInput);
    consensusTrace = result.consensusTrace;

    // Extract the actual weighted score from the consensus trace.
    // resolveConsensus always returns a "winner" (the single submission),
    // but the score may be negative (more NO than YES votes).
    const traceScores = (consensusTrace as any)?.scores as Record<string, number> | undefined;
    const submissionScore = traceScores?.[submissionId] ?? 0;
    consensusTrace = { ...consensusTrace, submissionScore };
  } catch {
    consensusTrace = { policy: "fallback_majority", reason: "resolve_error" };
  }

  // 6. Determine action from vote distribution (direct counting)
  // resolveConsensus provides the audit trace; vote counting determines the action.
  // This avoids the "always-a-winner" problem where resolveConsensus returns
  // a winner even when the score is negative.
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

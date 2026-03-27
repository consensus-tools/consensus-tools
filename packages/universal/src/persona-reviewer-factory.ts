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
//   5. Synthesize ConsensusInput (Job, Submissions, Votes)
//   6. Call resolveConsensus() with the configured policy
//   7. Return LlmDecisionResult

// ── Vote Parsing ─────────────────────────────────────────────────────

interface ParsedVote {
  vote: "YES" | "NO" | "REWRITE";
  confidence: number;
  rationale: string;
}

const VOTE_PATTERN = /\b(YES|NO|REWRITE)\b/i;
const CONFIDENCE_PATTERN = /confidence[:\s]*([0-9]*\.?[0-9]+)/i;

function parseVoteFromLlm(response: string): ParsedVote | null {
  const voteMatch = response.match(VOTE_PATTERN);
  if (!voteMatch) return null;

  const vote = voteMatch[1]!.toUpperCase() as "YES" | "NO" | "REWRITE";
  const confMatch = response.match(CONFIDENCE_PATTERN);
  const confidence = confMatch?.[1] ? Math.min(1, Math.max(0, parseFloat(confMatch[1]))) : 0.5;

  // Use the full response as rationale (stripped of vote/confidence lines)
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
  // Use systemPrompt if available (EvalPersonaConfig), otherwise construct from role/bias
  const evalPersona = persona as Partial<EvalPersonaConfig>;
  const systemPrompt = evalPersona.systemPrompt ??
    `You are a ${persona.role} reviewer named ${persona.name}.` +
    (persona.bias ? ` Your bias: ${persona.bias}.` : "") +
    (persona.non_negotiables?.length
      ? ` Non-negotiables: ${persona.non_negotiables.join(", ")}.`
      : "") +
    (persona.failure_modes?.length
      ? ` Watch for: ${persona.failure_modes.join(", ")}.`
      : "");

  const regexContext = regexSignals.length > 0
    ? `\n\nRegex pre-screen detected these signals:\n${regexSignals.map((s) => `- ${s}`).join("\n")}`
    : "\n\nRegex pre-screen: no pattern matches detected.";

  const userPrompt =
    `Evaluate this tool call for risks:\n\n` +
    `Tool: ${toolName}\n` +
    `Arguments: ${JSON.stringify(args, null, 2)}\n` +
    regexContext +
    `\n\nRespond with:\n` +
    `VOTE: YES (safe to proceed), NO (block this action), or REWRITE (needs modification)\n` +
    `CONFIDENCE: 0.0 to 1.0\n` +
    `RATIONALE: Brief explanation of your decision`;

  return [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];
}

// ── Regex Pre-Screen ─────────────────────────────────────────────────

function runRegexPreScreen(
  toolName: string,
  args: Record<string, unknown>,
  guards: string[],
): string[] {
  const signals: string[] = [];

  for (const domain of guards) {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      model(messages),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error("LLM call timed out")),
        );
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// ── Regex Fallback Vote ──────────────────────────────────────────────

function regexFallbackVote(
  persona: PersonaConfig,
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
  return {
    vote: "YES",
    confidence: 0.4,
    rationale: "Regex fallback: no pattern matches (LLM unavailable)",
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
  const guards = config.guards ?? ["security", "compliance", "user-impact"];

  // 1. Regex pre-screen
  const regexSignals = runRegexPreScreen(toolName, args, guards);

  // 2. Risk tier check
  const tier = classifyTool(toolName, config.riskTiers);
  if (tier === "low") {
    // Fast-path: regex only, no LLM calls
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

        // Unparseable response, fall back to regex
        const fallback = regexFallbackVote(persona, toolName, args, guards);
        return {
          personaId: persona.id,
          personaName: persona.name,
          ...fallback,
          source: "regex_fallback" as const,
        };
      } catch {
        // LLM failure, fall back to regex
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
  //    Each persona creates a "submission" (their evaluation) and votes for it
  const now = new Date().toISOString();
  const jobId = `job_facade_${decisionId}`;

  // Create a minimal Job with the configured policy
  const job = {
    id: jobId,
    boardId: "",
    status: "SUBMITTED" as const,
    title: `Deliberation: ${toolName}`,
    description: JSON.stringify(args),
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

  // Each persona submits their evaluation
  const submissions = voteResults.map((v, i) => ({
    id: `sub_${decisionId}_${i}`,
    jobId,
    agentId: v.personaId,
    submittedAt: now,
    summary: v.rationale,
    artifacts: { vote: v.vote, confidence: v.confidence, source: v.source },
    confidence: v.confidence,
    requestedPayout: 0,
    status: "SUBMITTED" as const,
  }));

  // Each persona votes YES (+1) on their own submission
  // and scores based on their confidence
  const votes = voteResults.map((v, i) => ({
    id: `vote_${decisionId}_${i}`,
    jobId,
    agentId: v.personaId,
    submissionId: `sub_${decisionId}_${i}`,
    score: v.vote === "YES" ? 1 : v.vote === "NO" ? -1 : 0,
    weight: v.confidence,
    rationale: v.rationale,
    createdAt: now,
  }));

  // Reputation function from the manager
  const reputation = (agentId: string) =>
    config.reputationManager.getReputation(agentId);

  // 5. Resolve consensus
  const consensusInput: ConsensusInput = {
    job: job as any,
    submissions: submissions as any[],
    votes: votes as any[],
    reputation,
  };

  let consensusResult: ConsensusResult;
  try {
    consensusResult = resolveConsensus(consensusInput);
  } catch {
    // If resolution fails, fall back to simple majority
    const yesCount = voteResults.filter((v) => v.vote === "YES").length;
    const majority = yesCount > voteResults.length / 2;
    consensusResult = {
      winners: majority ? ["allow"] : ["block"],
      winningSubmissionIds: [],
      consensusTrace: { policy: "fallback_majority", reason: "resolve_error" },
      finalArtifact: null,
    };
  }

  // 6. Determine final action
  const winnerIds = new Set(consensusResult.winners);
  const winningVotes = voteResults.filter((v) => winnerIds.has(v.personaId));
  const dominantVote = winningVotes.length > 0
    ? winningVotes[0]!.vote
    : voteResults[0]?.vote ?? "YES";

  let action: "allow" | "block" | "escalate";
  if (dominantVote === "YES") {
    action = "allow";
  } else if (dominantVote === "NO") {
    action = "block";
  } else {
    action = "escalate";
  }

  // If no clear winner (empty winners), use simple vote counting
  if (consensusResult.winners.length === 0) {
    const yesCount = voteResults.filter((v) => v.vote === "YES").length;
    const noCount = voteResults.filter((v) => v.vote === "NO").length;
    action = yesCount >= noCount ? "allow" : "block";
  }

  // Compute aggregate score (0-1 based on vote distribution)
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
    consensusTrace: consensusResult.consensusTrace,
    aggregateScore,
  };

  // 7. Record decision for reputation tracking
  config.reputationManager.recordDecision(result);

  return result;
}

import type { SkillAgent, SkillProposal, GuardVoteResult, GuardPipelineResult, JudgeScore, ReputationDelta, RoundResult, ConsensusEvalResult } from "./types.js";

// ANSI colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";
const BG_BLUE = "\x1b[44m";
const BG_GREEN = "\x1b[42m";
const BG_RED = "\x1b[41m";
const BG_YELLOW = "\x1b[43m";

function bar(value: number, max: number, width = 20): string {
  const filled = Math.round((value / max) * width);
  return GREEN + "█".repeat(filled) + DIM + "░".repeat(width - filled) + RESET;
}

function decisionColor(decision: string): string {
  switch (decision) {
    case "ALLOW": return GREEN;
    case "BLOCK": return RED;
    case "REWRITE": return YELLOW;
    default: return WHITE;
  }
}

function voteColor(vote: string): string {
  switch (vote) {
    case "YES": return GREEN;
    case "NO": return RED;
    case "REWRITE": return YELLOW;
    default: return WHITE;
  }
}

export function renderHeader(agentCount: number): void {
  console.log(`\n${BG_BLUE}${WHITE}${BOLD} ⚡ SKILL GUARD CONSENSUS DEMO ${RESET}`);
  console.log(`${DIM}${agentCount} guard agents • reputation-weighted consensus • LLM-as-judge scoring${RESET}\n`);
}

export function renderRoundStart(round: number, skill: string, proposer: SkillAgent): void {
  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║${RESET}  Round ${BOLD}${round}${RESET} • ${MAGENTA}${skill}${RESET} • Proposer: ${BOLD}${proposer.name}${RESET} (rep: ${proposer.reputation})`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}`);
}

export function renderProposal(proposal: SkillProposal): void {
  console.log(`\n  ${BOLD}📝 Proposal:${RESET} ${proposal.changeSummary}`);
}

export function renderVoteTable(votes: GuardVoteResult[]): void {
  console.log(`\n  ${BOLD}Guard Votes:${RESET}`);
  console.log(`  ${"Agent".padEnd(24)} ${"Vote".padEnd(10)} ${"Risk".padEnd(8)} Reason`);
  console.log(`  ${DIM}${"─".repeat(70)}${RESET}`);

  for (const v of votes) {
    const color = voteColor(v.vote);
    console.log(
      `  ${v.evaluator.padEnd(24)} ${color}${v.vote.padEnd(10)}${RESET} ${v.risk.toFixed(2).padEnd(8)} ${DIM}${v.reason.slice(0, 40)}${RESET}`,
    );
  }
}

export function renderDecision(result: GuardPipelineResult): void {
  const color = decisionColor(result.decision);
  console.log(`\n  ${BOLD}Decision:${RESET} ${color}${BOLD}${result.decision}${RESET}`);
  console.log(
    `  ${DIM}risk: ${result.combinedRisk.toFixed(2)} • quorum: ${result.quorumMet ? "✓" : "✗"} • yes-ratio: ${result.weightedYesRatio.toFixed(2)}${RESET}`,
  );
}

export function renderJudgeScores(scores: JudgeScore): void {
  console.log(`\n  ${BOLD}🧑‍⚖️ Judge Scores:${RESET}`);
  const dims = [
    { name: "Clarity", value: scores.clarity },
    { name: "Completeness", value: scores.completeness },
    { name: "Actionability", value: scores.actionability },
  ];
  for (const d of dims) {
    const color = d.value >= 4 ? GREEN : d.value >= 3 ? YELLOW : RED;
    console.log(`  ${d.name.padEnd(16)} ${bar(d.value, 5, 15)} ${color}${d.value}/5${RESET}`);
  }
  console.log(`  ${DIM}${scores.reasoning}${RESET}`);
}

export function renderReputationDeltas(deltas: ReputationDelta[]): void {
  if (deltas.length === 0) return;
  console.log(`\n  ${BOLD}📊 Reputation Changes:${RESET}`);
  for (const d of deltas) {
    const sign = d.delta >= 0 ? "+" : "";
    const color = d.delta >= 0 ? GREEN : RED;
    console.log(`  ${d.agentId.padEnd(24)} ${color}${sign}${d.delta}${RESET} → ${d.newReputation}  ${DIM}${d.reason}${RESET}`);
  }
}

export function renderLeaderboard(agents: SkillAgent[]): void {
  const sorted = [...agents].sort((a, b) => b.reputation - a.reputation);
  console.log(`\n${BOLD}${BLUE}┌─── Leaderboard ────────────────────────────────┐${RESET}`);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
    console.log(`${BLUE}│${RESET} ${medal} ${a.name.padEnd(24)} ${bar(a.reputation, 150, 15)} ${BOLD}${a.reputation}${RESET}`);
  }
  console.log(`${BOLD}${BLUE}└────────────────────────────────────────────────┘${RESET}`);
}

export function renderRewriteNotice(cycle: number, maxRewrites: number): void {
  console.log(`\n  ${YELLOW}${BOLD}↻ Rewrite requested${RESET} (attempt ${cycle}/${maxRewrites})`);
}

export function renderSkillWritten(skillName: string, path: string): void {
  console.log(`\n  ${GREEN}${BOLD}✓ ${skillName}/SKILL.md updated${RESET} → ${DIM}${path}${RESET}`);
}

export function renderFinalSummary(allRounds: RoundResult[], agents: SkillAgent[]): void {
  console.log(`\n${BG_GREEN}${WHITE}${BOLD} DEMO COMPLETE ${RESET}\n`);

  const accepted = allRounds.filter((r) => r.accepted).length;
  const total = allRounds.length;
  console.log(`  Rounds: ${total} • Accepted: ${GREEN}${accepted}${RESET} • Rejected: ${RED}${total - accepted}${RESET}`);

  const totalRewrites = allRounds.reduce((sum, r) => sum + r.rewriteCount, 0);
  console.log(`  Total rewrites: ${totalRewrites}`);

  renderLeaderboard(agents);

  // Score progression per skill
  const skills = [...new Set(allRounds.map((r) => r.skill))];
  for (const skill of skills) {
    const rounds = allRounds.filter((r) => r.skill === skill);
    console.log(`\n  ${BOLD}${skill}${RESET} score progression:`);
    for (const r of rounds) {
      const avg = ((r.judgeScores.clarity + r.judgeScores.completeness + r.judgeScores.actionability) / 3).toFixed(1);
      const color = parseFloat(avg) >= 4 ? GREEN : parseFloat(avg) >= 3 ? YELLOW : RED;
      console.log(`    Round ${r.round}: ${color}${avg}/5${RESET} (c:${r.judgeScores.clarity} co:${r.judgeScores.completeness} a:${r.judgeScores.actionability})`);
    }
  }
}

export function renderConsensusEval(result: ConsensusEvalResult, labelA = "Version A", labelB = "Version B"): void {
  console.log(`\n  ${BOLD}${CYAN}── Consensus Eval (${result.perAgent.length} agents) ──${RESET}\n`);

  // Per-agent breakdown
  console.log(`  ${"Agent".padEnd(24)} ${"Rep".padEnd(6)} ${"A".padEnd(12)} ${"B".padEnd(12)} ${"Winner".padEnd(8)} Reasoning`);
  console.log(`  ${DIM}${"─".repeat(80)}${RESET}`);

  for (const a of result.perAgent) {
    const aAvg = ((a.aScores.clarity + a.aScores.completeness + a.aScores.actionability) / 3).toFixed(1);
    const bAvg = ((a.bScores.clarity + a.bScores.completeness + a.bScores.actionability) / 3).toFixed(1);
    const wColor = a.winner === "B" ? GREEN : a.winner === "A" ? YELLOW : WHITE;
    console.log(
      `  ${a.agentName.padEnd(24)} ${String(a.reputation).padEnd(6)} ${aAvg.padEnd(12)} ${bAvg.padEnd(12)} ${wColor}${a.winner.padEnd(8)}${RESET} ${DIM}${a.reasoning.slice(0, 40)}${RESET}`,
    );
  }

  // Composite
  const aAvg = ((result.aComposite.clarity + result.aComposite.completeness + result.aComposite.actionability) / 3).toFixed(2);
  const bAvg = ((result.bComposite.clarity + result.bComposite.completeness + result.bComposite.actionability) / 3).toFixed(2);
  const deltaAvg = ((result.delta.clarity + result.delta.completeness + result.delta.actionability) / 3);
  const deltaColor = deltaAvg > 0 ? GREEN : deltaAvg < 0 ? RED : WHITE;
  const deltaSign = deltaAvg >= 0 ? "+" : "";

  console.log(`\n  ${BOLD}Composite (rep-weighted):${RESET}`);
  console.log(`    ${labelA}: c:${result.aComposite.clarity.toFixed(1)} co:${result.aComposite.completeness.toFixed(1)} a:${result.aComposite.actionability.toFixed(1)}  avg:${aAvg}`);
  console.log(`    ${labelB}: c:${result.bComposite.clarity.toFixed(1)} co:${result.bComposite.completeness.toFixed(1)} a:${result.bComposite.actionability.toFixed(1)}  avg:${bAvg}`);
  console.log(`    Delta:    c:${deltaSign}${result.delta.clarity.toFixed(1)} co:${deltaSign}${result.delta.completeness.toFixed(1)} a:${deltaSign}${result.delta.actionability.toFixed(1)}  avg:${deltaColor}${deltaSign}${deltaAvg.toFixed(2)}${RESET}`);

  // Winner
  const winColor = result.winner === "B" ? GREEN : result.winner === "A" ? YELLOW : WHITE;
  console.log(`\n  ${BOLD}Winner:${RESET} ${winColor}${BOLD}${result.winner}${RESET} (agreement: ${(result.agreement * 100).toFixed(0)}%${result.quorumMet ? "" : ` ${RED}BELOW QUORUM${RESET}`})`);
}

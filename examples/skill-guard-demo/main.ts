import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { execSync, execFileSync } from "child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createAgents, getProposer } from "./lib/agents.js";
import { proposeImprovement, mockProposal } from "./lib/proposer.js";
import { runSkillGuards, mockGuardResult } from "./lib/guard-pipeline.js";
import { judgeSkillQuality, judgePasses, mockJudgeScores } from "./lib/judge.js";
import { ReputationTracker } from "./lib/reputation.js";
import {
  renderHeader,
  renderRoundStart,
  renderProposal,
  renderVoteTable,
  renderDecision,
  renderJudgeScores,
  renderReputationDeltas,
  renderLeaderboard,
  renderRewriteNotice,
  renderSkillWritten,
  renderFinalSummary,
} from "./lib/renderer.js";
import type { RoundResult, SkillProposal, GuardPipelineResult } from "./lib/types.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── CLI Args ────────────────────────────────────────────────────────

function parseArgs(): { rounds: number; skills: string[]; maxRewrites: number; model: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  const get = (flag: string, def: string) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1]! : def;
  };
  return {
    rounds: parseInt(get("--rounds", "3"), 10),
    skills: get("--skills", "browse,qa").split(","),
    maxRewrites: parseInt(get("--max-rewrites", "2"), 10),
    model: get("--model", "claude-sonnet-4-6"),
    dryRun: args.includes("--dry-run"),
  };
}

// ── Validation ──────────────────────────────────────────────────────

function validate(config: ReturnType<typeof parseArgs>, forkDir: string): void {
  if (!config.dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is required (or use --dry-run)");
    process.exit(1);
  }

  if (config.rounds < 1) {
    console.error("Error: --rounds must be >= 1");
    process.exit(1);
  }

  if (config.maxRewrites < 0) {
    console.error("Error: --max-rewrites must be >= 0");
    process.exit(1);
  }

  for (const skill of config.skills) {
    const skillPath = join(forkDir, skill, "SKILL.md");
    if (!existsSync(skillPath)) {
      console.error(`Error: SKILL.md not found at ${skillPath}`);
      console.error(`  Available skills in fork: check ${forkDir} for directories containing SKILL.md`);
      process.exit(1);
    }
  }
}

// ── Fork Management ─────────────────────────────────────────────────

const FORK_DIR = "/tmp/consensus-gstack-evals";

function ensureFork(): string {
  if (existsSync(join(FORK_DIR, ".git"))) {
    console.log(`  Using existing fork at ${FORK_DIR}`);
    return FORK_DIR;
  }

  // Check gh is installed
  try {
    execFileSync("which", ["gh"], { stdio: "pipe" });
  } catch {
    console.error("Error: GitHub CLI (gh) is required to clone the fork.");
    console.error("  Install: https://cli.github.com/");
    process.exit(1);
  }

  console.log(`  Cloning kaicianflone/consensus-gstack-evals → ${FORK_DIR}`);
  execSync(`gh repo clone kaicianflone/consensus-gstack-evals ${FORK_DIR}`, { stdio: "inherit" });
  return FORK_DIR;
}

function loadSkillContent(forkDir: string, skillName: string): string {
  const path = join(forkDir, skillName, "SKILL.md");
  return readFileSync(path, "utf-8");
}

function writeSkillContent(forkDir: string, skillName: string, content: string): string {
  const dirPath = join(forkDir, skillName);
  mkdirSync(dirPath, { recursive: true });
  const path = join(dirPath, "SKILL.md");
  writeFileSync(path, content, "utf-8");
  return path;
}

// ── Audit Log ───────────────────────────────────────────────────────

const AUDIT_DIR = join(FORK_DIR, ".data");
const AUDIT_PATH = join(AUDIT_DIR, "skill-guard-audit.ndjson");

function audit(event: string, data: Record<string, unknown>): void {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    const entry = JSON.stringify({ ts: new Date().toISOString(), event, ...data });
    appendFileSync(AUDIT_PATH, entry + "\n");
  } catch {
    // Audit logging is best-effort — never crash the demo
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const forkDir = ensureFork();
  validate(config, forkDir);

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "dry-run" });
  const model = anthropic(config.model);

  const agents = createAgents();
  const repPath = join(forkDir, ".data", "reputation.json");
  const reputation = new ReputationTracker(agents, config.dryRun ? undefined : repPath);
  const allRounds: RoundResult[] = [];

  renderHeader(agents.length);
  if (reputation.isLoaded()) {
    console.log(`  Loaded reputation from ${reputation.getTotalRounds()} previous rounds`);
    renderLeaderboard(agents);
  }
  audit("demo.start", { rounds: config.rounds, skills: config.skills, dryRun: config.dryRun, priorRounds: reputation.getTotalRounds() });

  let globalRound = 0;

  for (const skillName of config.skills) {
    let currentContent = loadSkillContent(forkDir, skillName);
    console.log(`\n${"\x1b[1m"}Loading ${skillName}/SKILL.md (${currentContent.length} chars)${"\x1b[0m"}`);

    // Score baseline before any rounds
    let baselineAvg: number;
    if (config.dryRun) {
      baselineAvg = 3.0;
      console.log(`  ${"\x1b[2m"}Baseline (mock): 3.0/5${"\x1b[0m"}`);
    } else {
      console.log(`  Scoring baseline ${skillName}/SKILL.md...`);
      try {
        const baselineScores = await judgeSkillQuality(skillName, currentContent, model);
        baselineAvg = (baselineScores.clarity + baselineScores.completeness + baselineScores.actionability) / 3;
        console.log(`  ${"\x1b[1m"}Baseline: ${baselineAvg.toFixed(1)}/5${"\x1b[0m"} (c:${baselineScores.clarity} co:${baselineScores.completeness} a:${baselineScores.actionability})`);
        audit("baseline", { skill: skillName, scores: baselineScores, avg: baselineAvg });
      } catch {
        baselineAvg = 3.0;
        console.log(`  ${"\x1b[33m"}Baseline scoring failed — using 3.0 as default${"\x1b[0m"}`);
      }
    }

    for (let round = 1; round <= config.rounds; round++) {
      globalRound++;
      const proposer = getProposer(agents, globalRound - 1);
      renderRoundStart(globalRound, skillName, proposer);

      // Step 1: Generate proposal
      let proposal: SkillProposal;
      if (config.dryRun) {
        proposal = mockProposal(proposer, skillName, currentContent);
      } else {
        const result = await proposeImprovement(proposer, skillName, currentContent, null, model);
        if (!result) {
          console.log(`\n  \x1b[33m⚠ Proposal failed or unchanged — skipping round\x1b[0m`);
          audit("round.skipped", { round: globalRound, skill: skillName, proposer: proposer.id, reason: "proposal_failed" });
          continue;
        }
        proposal = result;
      }
      renderProposal(proposal);
      audit("proposal", { round: globalRound, skill: skillName, proposer: proposer.id, summary: proposal.changeSummary });

      // Step 2-4: Guard evaluation with rewrite loop
      let guardResult: GuardPipelineResult;
      let rewriteCount = 0;

      if (config.dryRun) {
        guardResult = mockGuardResult(agents);
      } else {
        if (!config.dryRun) await delay(3000); // rate limit buffer after proposer
        guardResult = await runSkillGuards(proposal, agents, model);
      }

      renderVoteTable(guardResult.votes);
      renderDecision(guardResult);
      audit("guard.decision", {
        round: globalRound,
        decision: guardResult.decision,
        votes: guardResult.votes.map((v) => ({ evaluator: v.evaluator, vote: v.vote, risk: v.risk })),
        combinedRisk: guardResult.combinedRisk,
      });

      while (guardResult.decision === "REWRITE" && rewriteCount < config.maxRewrites) {
        rewriteCount++;
        renderRewriteNotice(rewriteCount, config.maxRewrites);

        const feedback = guardResult.votes
          .filter((v) => v.vote !== "YES")
          .map((v) => `${v.evaluator}: ${v.reason}`)
          .join("\n");

        if (config.dryRun) {
          guardResult = { ...mockGuardResult(agents), decision: "ALLOW" };
        } else {
          const revised = await proposeImprovement(proposer, skillName, currentContent, feedback, model);
          if (!revised) {
            console.log(`\n  \x1b[33m⚠ Rewrite failed — treating as BLOCK\x1b[0m`);
            guardResult = { ...guardResult, decision: "BLOCK" };
            break;
          }
          proposal = revised;
          renderProposal(proposal);

          guardResult = await runSkillGuards(proposal, agents, model);
        }

        renderVoteTable(guardResult.votes);
        renderDecision(guardResult);
        audit("guard.rewrite", { round: globalRound, cycle: rewriteCount, decision: guardResult.decision });
      }

      // Step 5: LLM-as-judge scoring (with defense-in-depth try/catch)
      let judgeScores;
      if (config.dryRun) {
        judgeScores = mockJudgeScores(round);
      } else {
        if (!config.dryRun) await delay(5000); // rate limit buffer after guards
        try {
          judgeScores = await judgeSkillQuality(skillName, proposal.proposedContent, model);
        } catch (err: any) {
          console.error(`  [judge] Unexpected error: ${err.message}`);
          judgeScores = { clarity: 2, completeness: 2, actionability: 2, reasoning: "Judge unavailable — fail-safe" };
        }
      }
      renderJudgeScores(judgeScores);
      audit("judge", { round: globalRound, scores: judgeScores });

      // Step 6: Reputation settlement
      const deltas = reputation.settleRound(
        guardResult.votes,
        judgeScores,
        proposer.id,
        guardResult,
        rewriteCount,
        config.maxRewrites,
      );
      reputation.syncToAgents(agents);
      renderReputationDeltas(deltas);
      audit("settlement", { round: globalRound, deltas: deltas.map((d) => ({ agent: d.agentId, delta: d.delta, rep: d.newReputation })) });

      // Step 7: Write if accepted — must ALLOW, pass judge, AND improve over baseline by >= 0.5
      const proposalAvg = (judgeScores.clarity + judgeScores.completeness + judgeScores.actionability) / 3;
      const improvement = proposalAvg - baselineAvg;
      const MIN_IMPROVEMENT = 0.3;
      const accepted = guardResult.decision === "ALLOW" && judgePasses(judgeScores) && improvement >= MIN_IMPROVEMENT;

      if (guardResult.decision === "ALLOW" && judgePasses(judgeScores) && improvement < MIN_IMPROVEMENT) {
        console.log(`\n  \x1b[33m⚠ Proposal passed guards + judge but improvement too small (${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)} vs baseline, need >= +${MIN_IMPROVEMENT}) — not writing\x1b[0m`);
      }

      if (accepted) {
        currentContent = proposal.proposedContent;
        baselineAvg = proposalAvg; // new baseline for next round
        const writtenPath = writeSkillContent(forkDir, skillName, currentContent);
        renderSkillWritten(skillName, writtenPath);
        audit("skill.written", { round: globalRound, skill: skillName, path: writtenPath, improvement: improvement.toFixed(2) });
      }

      allRounds.push({
        round: globalRound,
        skill: skillName,
        proposer: proposer.id,
        proposal,
        guardResult,
        judgeScores,
        reputationDeltas: deltas,
        rewriteCount,
        accepted,
      });

      renderLeaderboard(agents);
    }
  }

  renderFinalSummary(allRounds, agents);

  // Save reputation to disk for RL across runs
  for (const _ of allRounds) reputation.incrementRounds();
  reputation.saveToDisk();
  console.log(`\n  \x1b[2mReputation saved (${reputation.getTotalRounds()} total rounds)\x1b[0m`);

  audit("demo.complete", {
    totalRounds: allRounds.length,
    accepted: allRounds.filter((r) => r.accepted).length,
    leaderboard: agents.map((a) => ({ id: a.id, rep: a.reputation })),
  });

  // Optional commit (using execFileSync for shell safety)
  if (!config.dryRun && allRounds.some((r) => r.accepted)) {
    const rl = await import("readline");
    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) =>
      iface.question("\n  Commit changes to consensus-gstack-evals? (y/n) ", resolve),
    );
    iface.close();

    if (answer.toLowerCase() === "y") {
      const acceptedSkills = [...new Set(allRounds.filter((r) => r.accepted).map((r) => r.skill))];
      const msg = `skill-guard-demo: improve ${acceptedSkills.join(", ")} SKILL.md via consensus`;
      execFileSync("git", ["add", "-A"], { cwd: forkDir, stdio: "inherit" });
      execFileSync("git", ["commit", "-m", msg], { cwd: forkDir, stdio: "inherit" });
      console.log(`\n  Committed to ${forkDir}`);
    }
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

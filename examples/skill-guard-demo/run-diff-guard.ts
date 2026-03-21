import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { createAgents } from "./lib/agents.js";
import { runDiffGuards } from "./lib/diff-guard.js";
import { ReputationTracker } from "./lib/reputation.js";
import {
  renderHeader,
  renderVoteTable,
  renderReputationDeltas,
  renderLeaderboard,
} from "./lib/renderer.js";

const FORK_DIR = "/tmp/consensus-gstack-evals";
const REP_PATH = join(FORK_DIR, ".data", "reputation.json");

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY required");
    process.exit(1);
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = anthropic("claude-sonnet-4-6");

  // Load agents with persisted reputation
  const agents = createAgents();
  const reputation = new ReputationTracker(agents, REP_PATH);

  if (reputation.isLoaded()) {
    console.log(`\n  Loaded reputation from ${reputation.getTotalRounds()} previous rounds`);
  } else {
    console.log(`\n  Fresh reputation (no prior state)`);
  }

  renderHeader(agents.length);
  renderLeaderboard(agents);

  // Get the diff of qa/SKILL.md on the current branch
  const diff = execSync("git diff main -- qa/SKILL.md", { cwd: FORK_DIR, encoding: "utf-8" });
  if (!diff.trim()) {
    console.error("No diff found on current branch vs main for qa/SKILL.md");
    process.exit(1);
  }

  console.log(`\n  \x1b[1mDiff size:\x1b[0m ${diff.split("\n").length} lines`);

  // Load ground truth
  const groundTruth = readFileSync(join(FORK_DIR, "browse", "SKILL.md"), "utf-8");
  console.log(`  \x1b[1mGround truth:\x1b[0m browse/SKILL.md (${groundTruth.length} chars)`);

  // Run diff guards
  console.log(`\n  \x1b[1m\x1b[36m── Code Change Diff Review ──\x1b[0m\n`);

  const result = await runDiffGuards(diff, groundTruth, "qa", agents, model);

  renderVoteTable(result.votes);

  if (result.allPass) {
    console.log(`\n  \x1b[32m\x1b[1m✓ All guards approved the diff\x1b[0m`);
  } else {
    console.log(`\n  \x1b[31m\x1b[1m✗ Issues found:\x1b[0m`);
    for (const issue of result.issues) {
      console.log(`    - ${issue}`);
    }
  }

  // Settle reputation — for now we treat "all YES" as accurate since we manually fixed the diff
  // In production this would be validated by a separate accuracy checker
  const diffAccurate = result.allPass;
  const deltas = reputation.settleDiffGuard(result.votes, diffAccurate);
  reputation.syncToAgents(agents);
  reputation.incrementRounds();

  renderReputationDeltas(deltas);
  renderLeaderboard(agents);

  // Persist
  reputation.saveToDisk();
  console.log(`\n  \x1b[2mReputation saved to ${REP_PATH}\x1b[0m`);
  console.log(`  \x1b[2mTotal rounds tracked: ${reputation.getTotalRounds()}\x1b[0m\n`);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

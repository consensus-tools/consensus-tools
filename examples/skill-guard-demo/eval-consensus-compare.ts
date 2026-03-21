import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { readFileSync } from "fs";
import { createAgents } from "./lib/agents.js";
import { ReputationTracker } from "./lib/reputation.js";
import { consensusJudge } from "./lib/consensus-eval.js";
import { renderConsensusEval, renderLeaderboard, renderReputationDeltas } from "./lib/renderer.js";

const FORK_DIR = "/tmp/consensus-gstack-evals";
const REP_PATH = `${FORK_DIR}/.data/reputation.json`;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY required");
    process.exit(1);
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = anthropic("claude-sonnet-4-6");

  const defaultDoc = readFileSync("/tmp/upstream-qa-skill.md", "utf-8");
  const oursDoc = readFileSync(`${FORK_DIR}/qa/SKILL.md`, "utf-8");

  console.log(`Default v2.0.0: ${defaultDoc.length} chars`);
  console.log(`Ours (v2.0.0 + improvements): ${oursDoc.length} chars\n`);

  const agents = createAgents();
  const reputation = new ReputationTracker(agents, REP_PATH);

  if (reputation.isLoaded()) {
    console.log(`Loaded reputation from ${reputation.getTotalRounds()} prior rounds\n`);
    renderLeaderboard(agents);
  }

  const runs = parseInt(process.argv[2] || "10", 10);
  console.log(`\nRunning ${runs} A/B consensus eval comparisons...\n`);

  const allResults: { winner: string; agreement: number; deltaAvg: number }[] = [];

  for (let i = 1; i <= runs; i++) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Run ${i}/${runs}`);
    console.log(`${"=".repeat(60)}`);

    const result = await consensusJudge("qa", defaultDoc, oursDoc, agents, model);
    renderConsensusEval(result, "Default", "Ours");

    const deltaAvg = (result.delta.clarity + result.delta.completeness + result.delta.actionability) / 3;
    allResults.push({ winner: result.winner, agreement: result.agreement, deltaAvg });

    // Settle reputation if there's a clear winner
    if (result.winner === "A" || result.winner === "B") {
      const deltas = reputation.settleEval(
        result.perAgent.map((a) => ({ agentId: a.agentId, winner: a.winner })),
        result.winner,
      );
      reputation.syncToAgents(agents);
      renderReputationDeltas(deltas);
    }

    reputation.incrementRounds();
    reputation.saveToDisk();
  }

  // Summary
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("CONSENSUS EVAL SUMMARY");
  console.log(`${"=".repeat(60)}\n`);

  const bWins = allResults.filter((r) => r.winner === "B").length;
  const aWins = allResults.filter((r) => r.winner === "A").length;
  const ties = allResults.filter((r) => r.winner === "TIE" || r.winner === "UNKNOWN").length;
  const avgDelta = allResults.reduce((s, r) => s + r.deltaAvg, 0) / allResults.length;
  const avgAgreement = allResults.reduce((s, r) => s + r.agreement, 0) / allResults.length;

  console.log(`Runs: ${runs}`);
  console.log(`Ours wins: ${bWins}/${runs} (${((bWins / runs) * 100).toFixed(0)}%)`);
  console.log(`Default wins: ${aWins}/${runs}`);
  console.log(`Ties: ${ties}/${runs}`);
  console.log(`Avg delta (B-A): ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(3)}`);
  console.log(`Avg agreement: ${(avgAgreement * 100).toFixed(0)}%`);

  console.log(`\nReputation after ${reputation.getTotalRounds()} total rounds:`);
  renderLeaderboard(agents);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

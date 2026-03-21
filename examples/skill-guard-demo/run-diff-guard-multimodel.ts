import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { createAgents } from "./lib/agents.js";
import { runDiffGuards } from "./lib/diff-guard.js";
import { renderVoteTable } from "./lib/renderer.js";

const FORK_DIR = "/tmp/consensus-gstack-evals";

async function runWithModel(modelName: string, model: any, runs: number) {
  const diff = execSync("git diff main -- qa/SKILL.md qa/SKILL.md.tmpl scripts/gen-skill-docs.ts", { cwd: FORK_DIR, encoding: "utf-8" });
  const groundTruth = readFileSync(join(FORK_DIR, "browse", "SKILL.md"), "utf-8");
  const agents = createAgents();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${modelName} — ${runs} runs`);
  console.log(`${"=".repeat(60)}`);

  const results: { run: number; votes: { evaluator: string; vote: string; risk: number }[]; allPass: boolean; issues: string[] }[] = [];

  for (let i = 1; i <= runs; i++) {
    console.log(`\n--- Run ${i}/${runs} ---`);
    try {
      const result = await runDiffGuards(diff, groundTruth, "qa", agents, model);
      renderVoteTable(result.votes);

      if (!result.allPass) {
        console.log(`  \x1b[31mIssues:\x1b[0m`);
        for (const issue of result.issues) {
          console.log(`    - ${issue.slice(0, 120)}`);
        }
      } else {
        console.log(`  \x1b[32m✓ All guards approved\x1b[0m`);
      }

      results.push({
        run: i,
        votes: result.votes.map(v => ({ evaluator: v.evaluator, vote: v.vote, risk: v.risk })),
        allPass: result.allPass,
        issues: result.issues,
      });
    } catch (err: any) {
      console.error(`  \x1b[31mRun ${i} failed: ${err.message}\x1b[0m`);
      results.push({ run: i, votes: [], allPass: false, issues: [`Run failed: ${err.message}`] });
    }

    if (i < runs) await new Promise(r => setTimeout(r, 5000));
  }

  // Summary
  const passed = results.filter(r => r.allPass).length;
  const failed = results.filter(r => !r.allPass).length;
  console.log(`\n${modelName} Summary: ${passed}/${runs} clean, ${failed}/${runs} flagged issues`);

  if (failed > 0) {
    const allIssues = results.filter(r => !r.allPass).flatMap(r => r.issues);
    const unique = [...new Set(allIssues)];
    console.log(`  Unique issues found:`);
    for (const issue of unique) {
      console.log(`    - ${issue.slice(0, 150)}`);
    }
  }

  return { model: modelName, passed, failed, results };
}

async function main() {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const opusModel = anthropic("claude-opus-4-6");
  const gptModel = openai("gpt-5.4");

  const opusResults = await runWithModel("Claude Opus 4.6", opusModel, 5);

  console.log("\n\n" + "█".repeat(60));
  console.log("  Switching to GPT-5.4...");
  console.log("█".repeat(60));

  await new Promise(r => setTimeout(r, 10000));

  const gptResults = await runWithModel("GPT-5.4", gptModel, 5);

  // Final comparison
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("  MULTI-MODEL DIFF GUARD COMPARISON");
  console.log(`${"=".repeat(60)}\n`);
  console.log(`  Claude Opus 4.6:  ${opusResults.passed}/5 clean, ${opusResults.failed}/5 flagged`);
  console.log(`  GPT-5.4:          ${gptResults.passed}/5 clean, ${gptResults.failed}/5 flagged`);
  console.log(`\n  Agreement: ${opusResults.passed === gptResults.passed ? "Models agree" : "Models disagree"}`);
}

main().catch(console.error);

import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { readFileSync } from "fs";
import { judgeSkillQuality } from "./lib/judge.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const model = anthropic("claude-sonnet-4-6");

  const content = readFileSync("/tmp/consensus-gstack-evals/qa/SKILL.md", "utf-8");
  console.log(`qa/SKILL.md: ${content.length} chars\n`);
  console.log("=== qa/SKILL.md vanilla evals (main branch, 10 runs) ===\n");

  const results: { clarity: number; completeness: number; actionability: number; avg: number; reasoning: string }[] = [];

  for (let i = 1; i <= 10; i++) {
    console.log(`Run ${i}/10...`);
    const scores = await judgeSkillQuality("qa", content, model);
    const avg = (scores.clarity + scores.completeness + scores.actionability) / 3;
    results.push({ ...scores, avg });
    console.log(`  c:${scores.clarity} co:${scores.completeness} a:${scores.actionability} avg:${avg.toFixed(2)}`);
    console.log(`  reasoning: ${scores.reasoning}`);
    console.log();
    if (i < 10) await delay(8000);
  }

  console.log("\n=== SUMMARY ===\n");
  console.log("Run  Clarity  Completeness  Actionability  Avg");
  console.log("───  ───────  ────────────  ─────────────  ───");
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    console.log(`${String(i + 1).padStart(3)}  ${String(r.clarity).padStart(7)}  ${String(r.completeness).padStart(12)}  ${String(r.actionability).padStart(13)}  ${r.avg.toFixed(1)}`);
  }

  const avgClarity = results.reduce((s, r) => s + r.clarity, 0) / results.length;
  const avgCompleteness = results.reduce((s, r) => s + r.completeness, 0) / results.length;
  const avgActionability = results.reduce((s, r) => s + r.actionability, 0) / results.length;
  const avgOverall = results.reduce((s, r) => s + r.avg, 0) / results.length;

  console.log("───  ───────  ────────────  ─────────────  ───");
  console.log(`AVG  ${avgClarity.toFixed(1).padStart(7)}  ${avgCompleteness.toFixed(1).padStart(12)}  ${avgActionability.toFixed(1).padStart(13)}  ${avgOverall.toFixed(2)}`);

  const stdDev = Math.sqrt(results.reduce((s, r) => s + (r.avg - avgOverall) ** 2, 0) / results.length);
  console.log(`\nStd dev: ${stdDev.toFixed(3)}`);
  console.log(`Range: ${Math.min(...results.map(r => r.avg)).toFixed(1)} – ${Math.max(...results.map(r => r.avg)).toFixed(1)}`);
}

main().catch(console.error);

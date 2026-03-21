import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { readFileSync } from "fs";
import { judgeSkillQuality } from "./lib/judge.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const model = anthropic("claude-sonnet-4-6");

  const original = readFileSync("/tmp/qa-original.md", "utf-8");
  const improved = readFileSync("/tmp/consensus-gstack-evals/qa/SKILL.md", "utf-8");

  console.log("=== ORIGINAL qa/SKILL.md (baseline 3.3/5) — 2 retests ===\n");

  for (let i = 1; i <= 2; i++) {
    console.log(`  Run ${i}...`);
    const scores = await judgeSkillQuality("qa", original, model);
    const avg = ((scores.clarity + scores.completeness + scores.actionability) / 3).toFixed(1);
    console.log(`  → c:${scores.clarity} co:${scores.completeness} a:${scores.actionability} avg:${avg}`);
    console.log(`    ${scores.reasoning.slice(0, 150)}...\n`);
    await delay(8000);
  }

  console.log("\n=== IMPROVED qa/SKILL.md (scored 5.0/5) — 2 retests ===\n");

  for (let i = 1; i <= 2; i++) {
    console.log(`  Run ${i}...`);
    const scores = await judgeSkillQuality("qa", improved, model);
    const avg = ((scores.clarity + scores.completeness + scores.actionability) / 3).toFixed(1);
    console.log(`  → c:${scores.clarity} co:${scores.completeness} a:${scores.actionability} avg:${avg}`);
    console.log(`    ${scores.reasoning.slice(0, 150)}...\n`);
    await delay(8000);
  }
}

main().catch(console.error);

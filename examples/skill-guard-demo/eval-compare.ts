import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { readFileSync } from "fs";
import { generateText } from "ai";
import { validateJudgeScore } from "./lib/judge.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RunResult {
  temp: number;
  clarity: number;
  completeness: number;
  actionability: number;
  avg: number;
}

async function evalAtTemp(label: string, content: string, temp: number, model: any, runs: number): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (let i = 1; i <= runs; i++) {
    const result = await generateText({
      model,
      temperature: temp,
      prompt: `You are evaluating documentation quality for an AI coding agent's CLI tool reference.

The agent reads this documentation to learn how to use a headless browser CLI. It needs to:
1. Understand what each command does
2. Know what arguments to pass
3. Know valid values for enum-like parameters
4. Construct correct command invocations without guessing

Rate the following qa/SKILL.md on three dimensions (1-5 scale):

- **clarity** (1-5): Can an agent understand what each command/flag does from the description alone?
- **completeness** (1-5): Are arguments, valid values, and important behaviors documented? Would an agent need to guess anything?
- **actionability** (1-5): Can an agent construct correct command invocations from this reference alone?

Scoring guide:
- 5: Excellent — no ambiguity, all info present
- 4: Good — minor gaps an experienced agent could infer
- 3: Adequate — some guessing required
- 2: Poor — significant info missing
- 1: Unusable — agent would fail without external help

Respond with ONLY valid JSON in this exact format:
{"clarity": N, "completeness": N, "actionability": N, "reasoning": "brief explanation"}

Here is the qa/SKILL.md to evaluate:

${content}`,
      maxTokens: 1024,
    });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const scores = validateJudgeScore(JSON.parse(jsonMatch[0]));
      const avg = (scores.clarity + scores.completeness + scores.actionability) / 3;
      results.push({ temp, clarity: scores.clarity, completeness: scores.completeness, actionability: scores.actionability, avg });
      console.log(`  ${label} t=${temp} run ${i}/${runs}: c:${scores.clarity} co:${scores.completeness} a:${scores.actionability} avg:${avg.toFixed(2)}`);
    }
    if (i < runs) await delay(8000);
  }
  return results;
}

async function main() {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const model = anthropic("claude-sonnet-4-6");

  const baseline = readFileSync("/tmp/upstream-qa-skill.md", "utf-8");
  const ours = readFileSync("/tmp/consensus-gstack-evals/qa/SKILL.md", "utf-8");
  console.log(`Default v2.0.0: ${baseline.length} chars`);
  console.log(`Ours (v2.0.0 + CLI ref): ${ours.length} chars\n`);

  const temps = [0, 0.3, 0.7];
  const RUNS = 5;
  const allV: RunResult[] = [];
  const allO: RunResult[] = [];

  for (const temp of temps) {
    console.log(`\n=== Temperature ${temp} ===\n`);
    console.log(`--- Default v2.0.0 ---`);
    allV.push(...await evalAtTemp("default", baseline, temp, model, RUNS));
    await delay(10000);
    console.log(`\n--- Ours (v2.0.0 + CLI ref) ---`);
    allO.push(...await evalAtTemp("ours", ours, temp, model, RUNS));
    await delay(10000);
  }

  const fmt = (r: RunResult[]) => {
    const avg = r.reduce((s, x) => s + x.avg, 0) / r.length;
    const c = r.reduce((s, x) => s + x.clarity, 0) / r.length;
    const co = r.reduce((s, x) => s + x.completeness, 0) / r.length;
    const a = r.reduce((s, x) => s + x.actionability, 0) / r.length;
    return { c: c.toFixed(1), co: co.toFixed(1), a: a.toFixed(1), avg: avg.toFixed(2) };
  };

  console.log("\n\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  for (const temp of temps) {
    const vt = allV.filter(r => r.temp === temp);
    const ot = allO.filter(r => r.temp === temp);
    const vf = fmt(vt), of2 = fmt(ot);
    console.log(`\nTemp ${temp}:`);
    console.log(`  Default:  c:${vf.c} co:${vf.co} a:${vf.a}  avg:${vf.avg}`);
    console.log(`  Ours:     c:${of2.c} co:${of2.co} a:${of2.a}  avg:${of2.avg}`);
    console.log(`  Delta:    ${(parseFloat(of2.avg) - parseFloat(vf.avg) >= 0 ? "+" : "")}${(parseFloat(of2.avg) - parseFloat(vf.avg)).toFixed(2)}`);
  }

  const vAll = fmt(allV), oAll = fmt(allO);
  console.log(`\nOverall (${allV.length} runs each):`);
  console.log(`  Default:  c:${vAll.c} co:${vAll.co} a:${vAll.a}  avg:${vAll.avg}`);
  console.log(`  Ours:     c:${oAll.c} co:${oAll.co} a:${oAll.a}  avg:${oAll.avg}`);
  console.log(`  Delta:    ${(parseFloat(oAll.avg) - parseFloat(vAll.avg) >= 0 ? "+" : "")}${(parseFloat(oAll.avg) - parseFloat(vAll.avg)).toFixed(2)}`);
}

main().catch(console.error);

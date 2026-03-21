import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Agent definitions (adapted for README review) ───

interface Agent {
  id: string;
  name: string;
  role: string;
  focus: string;
  reputation: number;
}

const AGENTS: Agent[] = [
  {
    id: "doc-architect",
    name: "Doc Architect",
    role: "structure",
    focus: "document structure, heading hierarchy, progressive disclosure, section ordering",
    reputation: 100,
  },
  {
    id: "api-accuracy",
    name: "API Accuracy Checker",
    role: "accuracy",
    focus: "export names, function signatures, parameter types, return types match source code",
    reputation: 100,
  },
  {
    id: "agent-usability",
    name: "Agent Usability Tester",
    role: "usability",
    focus: "can a developer use this README to get started without reading source? are examples runnable?",
    reputation: 100,
  },
  {
    id: "completeness-auditor",
    name: "Completeness Auditor",
    role: "completeness",
    focus: "are all public exports documented? missing setup steps? missing error scenarios?",
    reputation: 100,
  },
  {
    id: "style-guardian",
    name: "Style Guardian",
    role: "style",
    focus: "consistent markdown formatting, table alignment, code block language tags, no broken links",
    reputation: 100,
  },
];

// ─── Reputation persistence ───

const REP_FILE = "/tmp/readme-guard-reputation.json";

function loadReputation(): void {
  if (!existsSync(REP_FILE)) return;
  const data = JSON.parse(readFileSync(REP_FILE, "utf-8"));
  for (const agent of AGENTS) {
    if (data[agent.id] !== undefined) agent.reputation = data[agent.id];
  }
}

function saveReputation(): void {
  const data: Record<string, number> = {};
  for (const agent of AGENTS) data[agent.id] = agent.reputation;
  writeFileSync(REP_FILE, JSON.stringify(data, null, 2));
}

function settleEval(votes: Vote[], allPass: boolean): void {
  for (const v of votes) {
    const agent = AGENTS.find((a) => a.id === v.agentId)!;
    if (v.vote === "YES" && allPass) {
      agent.reputation = Math.min(200, agent.reputation + 3);
    } else if (v.vote === "YES" && !allPass) {
      agent.reputation = Math.max(10, agent.reputation - 2);
    } else if (v.vote !== "YES" && !allPass) {
      agent.reputation = Math.min(200, agent.reputation + 3);
    } else if (v.vote !== "YES" && allPass) {
      agent.reputation = Math.max(10, agent.reputation - 2);
    }
  }
}

// ─── Guard logic ───

interface Vote {
  agentId: string;
  agentName: string;
  vote: "YES" | "NO" | "REWRITE";
  risk: number;
  reason: string;
  reputation: number;
}

function buildPrompt(agent: Agent, diff: string, sourceCode: string, pkgName: string): string {
  return `You are ${agent.name}, reviewing a README.md diff for the "${pkgName}" package.

Your focus: ${agent.focus}

You are checking that the README changes are FACTUALLY ACCURATE against the source code provided below. The README should correctly describe exports, APIs, types, and usage patterns that actually exist in the code.

README DIFF (+ = additions, - = removals):
${diff}

SOURCE CODE (the authoritative reference — what the package actually exports and does):
${sourceCode}

Rules:
- Vote YES if the diff is factually accurate and well-structured
- Vote REWRITE if there are minor inaccuracies that should be fixed (wrong function names, incorrect signatures, misleading examples)
- Vote NO if there are serious inaccuracies (fabricated exports, completely wrong API usage, dangerous misinformation)
- Do NOT flag style preferences or opinions — only factual issues
- A README can omit internal details — that's fine. But what it DOES say must be correct.

Respond with exactly one line:
VOTE: <YES|NO|REWRITE> | RISK: <0.0-1.0> | REASON: <brief, cite specific inaccuracies if found>`;
}

function parseVote(text: string, agent: Agent): Vote {
  const voteMatch = /VOTE:\s*(YES|NO|REWRITE)/i.exec(text);
  const riskMatch = /RISK:\s*([\d.]+)/i.exec(text);
  const reasonMatch = /REASON:\s*(.+)/i.exec(text);
  return {
    agentId: agent.id,
    agentName: agent.name,
    vote: (voteMatch?.[1]?.toUpperCase() as "YES" | "NO" | "REWRITE") || "YES",
    risk: Math.min(1, Math.max(0, parseFloat(riskMatch?.[1] || "0.5"))),
    reason: reasonMatch?.[1]?.trim() || "No issues detected",
    reputation: agent.reputation,
  };
}

// ─── File mapping: README path → source glob ───

const FILE_MAP: Record<string, string[]> = {
  "packages/core/README.md": ["packages/core/src/index.ts", "packages/core/src/engine.ts", "packages/core/src/ledger.ts", "packages/core/src/storage.ts"],
  "packages/guards/README.md": ["packages/guards/src/index.ts", "packages/guards/src/voting.ts", "packages/guards/src/decision.ts", "packages/guards/src/registry.ts"],
  "packages/evals/README.md": ["packages/evals/src/index.ts", "packages/evals/src/types.ts", "packages/evals/src/consensus-eval.ts", "packages/evals/src/reputation.ts", "packages/evals/src/validation.ts"],
  "packages/schemas/README.md": ["packages/schemas/src/index.ts"],
  "packages/policies/README.md": ["packages/policies/src/index.ts"],
  "packages/workflows/README.md": ["packages/workflows/src/index.ts"],
  "packages/wrapper/README.md": ["packages/wrapper/src/index.ts"],
  "packages/telemetry/README.md": ["packages/telemetry/src/index.ts"],
  "packages/cli/README.md": ["packages/cli/src/index.ts"],
  "packages/sdk-client/README.md": ["packages/sdk-client/src/index.ts"],
  "packages/sdk-node/README.md": ["packages/sdk-node/src/index.ts"],
  "packages/adapters/mcp/README.md": ["packages/adapters/mcp/src/index.ts"],
  "packages/adapters/integrations/README.md": ["packages/adapters/integrations/src/index.ts"],
  "packages/adapters/notifications/README.md": ["packages/adapters/notifications/src/index.ts"],
  "packages/adapters/secrets/README.md": ["packages/adapters/secrets/src/index.ts"],
  "packages/adapters/openclaw/README.md": ["packages/adapters/openclaw/src/index.ts"],
  "apps/local-board/README.md": ["apps/local-board/src/index.ts"],
  "apps/dashboard/README.md": ["apps/dashboard/src/App.tsx", "apps/dashboard/src/main.tsx"],
};

function getSourceCode(files: string[]): string {
  const root = "/Users/kaicianflone/consensus-tools";
  let combined = "";
  for (const f of files) {
    const fullPath = `${root}/${f}`;
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, "utf-8");
      combined += `\n// === ${f} ===\n${content}\n`;
    }
  }
  return combined.slice(0, 12000); // cap to avoid context overflow
}

// ─── Main ───

async function main() {
  const root = "/Users/kaicianflone/consensus-tools";
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const model = anthropic("claude-sonnet-4-6");
  const RUNS = 5;

  loadReputation();

  // Get all changed README files
  const changedFiles = execSync("git diff HEAD~1 --name-only | grep README", { cwd: root, encoding: "utf-8" })
    .trim().split("\n").filter(Boolean);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  README Diff Guard — Sonnet 4.6 — ${changedFiles.length} files`);
  console.log(`${"=".repeat(60)}\n`);

  const summary: { file: string; passRate: string; issues: string[] }[] = [];

  for (const readmePath of changedFiles) {
    const sourceFiles = FILE_MAP[readmePath];
    if (!sourceFiles) {
      console.log(`  Skipping ${readmePath} (no source mapping)\n`);
      continue;
    }

    const diff = execSync(`git diff HEAD~1 -- ${readmePath}`, { cwd: root, encoding: "utf-8" });
    if (!diff.trim()) {
      console.log(`  Skipping ${readmePath} (no diff)\n`);
      continue;
    }

    const sourceCode = getSourceCode(sourceFiles);
    const pkgName = readmePath.replace(/\/README\.md$/, "");

    console.log(`\n${"─".repeat(60)}`);
    console.log(`  ${readmePath}`);
    console.log(`  Reputation: ${AGENTS.map((a) => `${a.id.slice(0, 8)}:${a.reputation}`).join("  ")}`);
    console.log(`${"─".repeat(60)}`);

    let runPassed = 0;
    const allIssues: string[] = [];

    for (let run = 1; run <= RUNS; run++) {
      const votes: Vote[] = [];

      for (const agent of AGENTS) {
        try {
          const result = await generateText({
            model,
            temperature: 0.3,
            prompt: buildPrompt(agent, diff, sourceCode, pkgName),
            maxTokens: 300,
          });
          votes.push(parseVote(result.text, agent));
        } catch (err: any) {
          votes.push({
            agentId: agent.id, agentName: agent.name,
            vote: "REWRITE", risk: 0.5,
            reason: `Review failed: ${err.message}`,
            reputation: agent.reputation,
          });
        }
        await new Promise((r) => setTimeout(r, 1500));
      }

      const yesCount = votes.filter((v) => v.vote === "YES").length;
      const allPass = yesCount >= 3; // 3/5 = pass
      if (allPass) runPassed++;

      // Settle reputation
      settleEval(votes, allPass);

      // Print run result
      const statusIcon = allPass ? "✓" : "✗";
      console.log(`  Run ${run}/5: ${statusIcon} ${yesCount}/5 YES`);
      for (const v of votes) {
        const tag = v.vote === "YES" ? "\x1b[32mYES\x1b[0m" : v.vote === "NO" ? "\x1b[31mNO\x1b[0m" : "\x1b[33mREWR\x1b[0m";
        const short = v.reason.slice(0, 80);
        console.log(`    ${v.agentName.padEnd(24)} ${tag}  ${v.risk.toFixed(2)}  ${short}`);
      }

      // Collect issues
      for (const v of votes) {
        if (v.vote !== "YES") allIssues.push(`[${v.agentId}] ${v.reason}`);
      }

      if (run < RUNS) await new Promise((r) => setTimeout(r, 3000));
    }

    saveReputation();

    summary.push({
      file: readmePath,
      passRate: `${runPassed}/${RUNS}`,
      issues: [...new Set(allIssues)],
    });

    console.log(`\n  Result: ${runPassed}/${RUNS} runs passed (3/5 YES threshold)`);
    if (allIssues.length > 0) {
      const unique = [...new Set(allIssues)];
      console.log(`  Unique issues (${unique.length}):`);
      for (const issue of unique.slice(0, 5)) {
        console.log(`    - ${issue.slice(0, 120)}`);
      }
    }
  }

  // Final summary
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("  FINAL SUMMARY");
  console.log(`${"=".repeat(60)}\n`);
  console.log(`  ${"File".padEnd(45)} Pass Rate  Issues`);
  console.log(`  ${"─".repeat(70)}`);
  for (const s of summary) {
    console.log(`  ${s.file.padEnd(45)} ${s.passRate.padEnd(10)} ${s.issues.length}`);
  }
  console.log(`\n  Final reputation:`);
  for (const a of AGENTS) {
    console.log(`    ${a.name.padEnd(24)} ${a.reputation}`);
  }
}

main().catch(console.error);

import chalk from "chalk";

// Re-export the type so tests can import it from here
export type { PlaygroundResult } from "../playground.js";

interface VoteRow {
  evaluator: string;
  vote: "YES" | "NO" | "REWRITE";
  reason: string;
  risk: number;
}

interface RenderInput {
  domain: string;
  scenarioName?: string;
  payload: Record<string, unknown>;
  votes: VoteRow[];
  hardBlockFlags: string[];
  decision: "ALLOW" | "BLOCK" | "REWRITE";
  maxRisk: number;
}

const MAX_REASON_LEN = 50;

function colorVote(vote: string): string {
  switch (vote) {
    case "YES": return chalk.green(vote);
    case "NO": return chalk.red(vote);
    case "REWRITE": return chalk.yellow(vote);
    default: return vote;
  }
}

function colorDecision(decision: string): string {
  switch (decision) {
    case "ALLOW": return chalk.bgGreen.black(` ${decision} `);
    case "BLOCK": return chalk.bgRed.white(` ${decision} `);
    case "REWRITE": return chalk.bgYellow.black(` ${decision} `);
    default: return decision;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function formatPayload(payload: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    let strVal: string;
    if (typeof value === "string") {
      strVal = value;
    } else {
      try { strVal = JSON.stringify(value); } catch { strVal = String(value); }
    }
    lines.push(`  ${chalk.dim(key)}: ${truncate(strVal, 60)}`);
  }
  return lines.join("\n");
}

export function renderPlaygroundOutput(result: RenderInput): string {
  const lines: string[] = [];
  const scenarioLabel = result.scenarioName ? ` (scenario: ${result.scenarioName})` : "";

  // Header
  lines.push("");
  lines.push(chalk.bold(`  GUARD PLAYGROUND — ${result.domain}${scenarioLabel}`));
  lines.push(chalk.dim("  " + "─".repeat(50)));
  lines.push(chalk.dim("  Reviewers: security, compliance, user-impact (cross-cutting) + domain evaluator"));
  lines.push("");

  // Input
  lines.push(chalk.bold("  INPUT"));
  lines.push(formatPayload(result.payload));
  lines.push("");

  // Hard-block flags
  lines.push(chalk.bold("  HARD-BLOCK FLAGS"));
  if (result.hardBlockFlags.length > 0) {
    for (const flag of result.hardBlockFlags) {
      lines.push(`  ${chalk.red("⛔")} ${flag}`);
    }
  } else {
    lines.push(`  ${chalk.green("✓")} NONE DETECTED`);
  }
  lines.push("");

  // Vote breakdown table
  lines.push(chalk.bold("  VOTE BREAKDOWN"));

  const evalWidth = 16;
  const voteWidth = 7;
  const riskWidth = 6;
  const reasonWidth = MAX_REASON_LEN;

  const header = `  ${pad("Reviewer", evalWidth)} ${pad("Vote", voteWidth)} ${pad("Risk", riskWidth)} ${pad("Reason", reasonWidth)}`;
  lines.push(chalk.dim(header));
  lines.push(chalk.dim("  " + "─".repeat(evalWidth + voteWidth + riskWidth + reasonWidth + 3)));

  for (const vote of result.votes) {
    const evaluator = pad(truncate(vote.evaluator, evalWidth), evalWidth);
    const voteStr = pad(colorVote(vote.vote), voteWidth + (colorVote(vote.vote).length - vote.vote.length));
    const risk = pad((vote.risk ?? 0).toFixed(2), riskWidth);
    const reason = truncate(vote.reason, reasonWidth);
    lines.push(`  ${evaluator} ${voteStr} ${risk} ${reason}`);
  }
  lines.push("");

  // Decision banner
  lines.push(chalk.dim("  " + "─".repeat(50)));
  lines.push(`  DECISION: ${colorDecision(result.decision)}  (max risk: ${result.maxRisk.toFixed(2)})`);
  lines.push(chalk.dim("  " + "─".repeat(50)));
  lines.push("");

  // Help text
  lines.push(chalk.dim("  Run with --domain <domain> --scenario <name> to try other inputs."));
  lines.push(chalk.dim("  Run with --input '{...}' to test your own payload."));
  lines.push("");

  return lines.join("\n");
}

function pad(str: string, width: number): string {
  if (str.length >= width) return str;
  return str + " ".repeat(width - str.length);
}

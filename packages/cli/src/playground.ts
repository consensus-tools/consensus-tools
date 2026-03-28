import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { GuardVote, GuardEvaluateInput } from "@consensus-tools/schemas";
import {
  createGuardTemplate,
  GUARD_CONFIGS,
  DEFAULT_PERSONA_TRIO,
  detectHardBlockFlags,
  extractStrings,
  evaluatorVotes,
} from "@consensus-tools/guards";

// ── Types ──────────────────────────────────────────────────────────

export interface ScenarioFile {
  domain: string;
  description: string;
  payload: Record<string, unknown>;
}

export interface PlaygroundResult {
  domain: string;
  scenarioName?: string;
  payload: Record<string, unknown>;
  votes: GuardVote[];
  hardBlockFlags: string[];
  decision: "ALLOW" | "BLOCK" | "REWRITE";
  maxRisk: number;
}

// ── Scenario loading ───────────────────────────────────────────────

export function loadScenario(
  scenariosDir: string,
  domain: string,
  name?: string,
): ScenarioFile {
  const prefix = `${domain}-`;
  const files = readdirSync(scenariosDir).filter(
    (f) => f.startsWith(prefix) && f.endsWith(".json"),
  );

  if (files.length === 0) {
    throw new Error(
      `No scenarios found for domain "${domain}". Available domains: ${getAvailableDomains(scenariosDir).join(", ")}`,
    );
  }

  files.sort();
  // Default to first scenario alphabetically if no name given
  const target = name ? `${domain}-${name}.json` : files[0]!;
  const filePath = path.resolve(scenariosDir, target);

  // Prevent path traversal (e.g., --scenario "../../../etc/passwd")
  if (!filePath.startsWith(path.resolve(scenariosDir))) {
    throw new Error(`Invalid scenario name: "${name}" — path traversal not allowed`);
  }

  if (!existsSync(filePath)) {
    const available = files.map((f) => f.replace(`${domain}-`, "").replace(".json", ""));
    throw new Error(
      `Scenario not found: "${name}" for domain "${domain}". Available: ${available.join(", ")}`,
    );
  }

  const data = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  if (!data.domain || typeof data.domain !== "string") {
    throw new Error(`Invalid scenario file "${target}": missing or invalid "domain" field`);
  }
  if (!data.payload || typeof data.payload !== "object") {
    throw new Error(`Invalid scenario file "${target}": missing or invalid "payload" field`);
  }
  return data as unknown as ScenarioFile;
}

export function listScenarios(scenariosDir: string): Record<string, string[]> {
  const files = readdirSync(scenariosDir).filter((f) => f.endsWith(".json")).sort();
  const grouped: Record<string, string[]> = {};

  for (const file of files) {
    const lastDash = file.lastIndexOf("-");
    if (lastDash === -1) continue;
    // Domain is everything before the last dash, scenario is after
    // But domains can have dashes (e.g., "code-merge"), so we need to find
    // the split point where the suffix is a known scenario name
    const withoutExt = file.replace(".json", "");
    const parts = withoutExt.split("-");
    // Try progressively longer domain prefixes
    let domain = "";
    let scenario = "";
    for (let i = 1; i < parts.length; i++) {
      const candidateDomain = parts.slice(0, i).join("-");
      const candidateScenario = parts.slice(i).join("-");
      domain = candidateDomain;
      scenario = candidateScenario;
    }
    if (!domain || !scenario) continue;

    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain]!.push(scenario);
  }

  return grouped;
}

function getAvailableDomains(scenariosDir: string): string[] {
  return Object.keys(listScenarios(scenariosDir));
}

// ── Input parsing ──────────────────────────────────────────────────

export function parseInput(input: string): Record<string, unknown> {
  // Try as file path first
  if (existsSync(input)) {
    const content = readFileSync(input, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  }

  // Try as inline JSON
  if (input.startsWith("{") || input.startsWith("[")) {
    return JSON.parse(input) as Record<string, unknown>;
  }

  // If it looks like a path but doesn't exist
  if (input.includes("/") || input.includes("\\") || input.endsWith(".json")) {
    throw new Error(`File not found: ${input}`);
  }

  throw new Error(
    `Invalid input: "${input.slice(0, 40)}..." is not valid JSON and does not match a file path. ` +
    `Pass a JSON string starting with { or a path to a .json file.`,
  );
}

// ── Evaluation ─────────────────────────────────────────────────────

export function evaluatePlayground(
  domain: string,
  payload: Record<string, unknown>,
): PlaygroundResult {
  const safePayload = payload ?? {};
  const votes: GuardVote[] = [];

  // 1. Run 3 cross-cutting guard templates (security, compliance, user-impact)
  for (const personaDomain of DEFAULT_PERSONA_TRIO) {
    const config = GUARD_CONFIGS[personaDomain];
    if (!config) continue;

    try {
      const template = createGuardTemplate(personaDomain, config);
      const input: GuardEvaluateInput = {
        boardId: "playground",
        action: { type: personaDomain, payload: safePayload },
      };
      const templateVotes = template.evaluate(input);
      votes.push(...templateVotes);
    } catch (err) {
      votes.push({
        evaluator: personaDomain,
        vote: "NO",
        reason: `⚠ ERROR: ${err instanceof Error ? err.message : String(err)}`,
        risk: 0.5,
      });
    }
  }

  // 2. Run domain-specific evaluator (4th row)
  try {
    const domainInput: GuardEvaluateInput = {
      boardId: "playground",
      action: { type: domain, payload: safePayload },
    };
    const domainVotes = evaluatorVotes(domainInput);
    votes.push(...domainVotes);
  } catch (err) {
    votes.push({
      evaluator: `${domain}-evaluator`,
      vote: "NO",
      reason: `⚠ ERROR: ${err instanceof Error ? err.message : String(err)}`,
      risk: 0.5,
    });
  }

  // 3. Detect hard-block flags
  const text = extractStrings(safePayload);
  const hardBlockFlags = detectHardBlockFlags(text);

  // 4. Aggregate decision
  const hasHardBlock = hardBlockFlags.length > 0;
  const hasNo = votes.some((v) => v.vote === "NO");
  const hasRewrite = votes.some((v) => v.vote === "REWRITE");
  const maxRisk = Math.max(...votes.map((v) => v.risk ?? 0), 0);

  let decision: "ALLOW" | "BLOCK" | "REWRITE";
  if (hasHardBlock || hasNo) {
    decision = "BLOCK";
  } else if (hasRewrite) {
    decision = "REWRITE";
  } else {
    decision = "ALLOW";
  }

  return {
    domain,
    payload: safePayload,
    votes,
    hardBlockFlags: hardBlockFlags as string[],
    decision,
    maxRisk,
  };
}

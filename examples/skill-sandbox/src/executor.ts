import * as fs from "fs";
import * as path from "path";
import { callModel } from "./rubric-builder.js";
import type { Rubric } from "./types.js";

type Model = "gpt-5-mini" | "claude-sonnet-4-6";

const FIXTURES_DIR = path.join(import.meta.dir, "..", "fixtures", "minimal-ts-app");

export function loadFixtureFiles(): { listing: string; files: Map<string, string> } {
  const files = new Map<string, string>();
  const entries: string[] = [];

  function walk(dir: string, prefix: string) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === "node_modules" || item.name === ".git") continue;
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        walk(path.join(dir, item.name), rel);
      } else {
        const content = fs.readFileSync(path.join(dir, item.name), "utf-8");
        files.set(rel, content);
        entries.push(rel);
      }
    }
  }

  walk(FIXTURES_DIR, "");

  let listing = "## File Listing\n\n";
  for (const entry of entries) {
    listing += `- ${entry}\n`;
  }
  listing += "\n## File Contents\n\n";
  for (const [filePath, content] of files) {
    listing += `### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
  }

  return { listing, files };
}

export function loadFixtureReadme(): string {
  try {
    return fs.readFileSync(path.join(FIXTURES_DIR, "README.md"), "utf-8");
  } catch {
    return "(no README found)";
  }
}

export async function executeSkill(
  skillContent: string,
  rubric: Rubric,
  model: Model,
): Promise<string> {
  const { listing } = loadFixtureFiles();
  const readme = loadFixtureReadme();

  const systemPrompt = `You are executing the following skill. This is a sandboxed text-only execution — produce your planning output, suggested diffs, documentation changes, or review findings. Do NOT actually write files.

## SKILL Definition
${skillContent}`;

  const userPrompt = `${rubric.testPrompt}

## Project Context

### README
${readme}

### Project Files
${listing}`;

  const output = await callModel(model, systemPrompt, userPrompt, 4000);
  return output;
}

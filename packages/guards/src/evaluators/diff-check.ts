import { createGuardTemplate } from "../templates.js";
import { detectSeoHardBlocks } from "./seo-taxonomy.js";
import type { GuardVote } from "@consensus-tools/schemas";

/**
 * Extract only added/removed lines from a unified diff.
 * Ignores context lines (space prefix) and file headers (+++/---).
 */
function extractChangedLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) return false;
      return line.startsWith("+") || line.startsWith("-");
    })
    .map((line) => line.slice(1)); // Remove the +/- prefix
}

export const diffCheckTemplate = createGuardTemplate("diff_check", {
  description: "Validates git diff matches approved SEO proposal — no design, route, or content drift",
  rules(payload): GuardVote[] {
    const proposal = (payload["approved_proposal"] || {}) as Record<string, unknown>;
    const diff = String(payload["git_diff"] || "");
    const filesChanged = (payload["files_changed"] || []) as string[];
    const approvedFile = String(proposal["file_path"] || "");

    // Scope match: only approved files should be in the diff
    const unexpectedFiles = filesChanged.filter((f) => f !== approvedFile);
    if (unexpectedFiles.length > 0) {
      return [{
        evaluator: "diff-check",
        vote: "NO",
        reason: `Diff touches files outside scope: ${unexpectedFiles.join(", ")}`,
        risk: 0.95,
      }];
    }

    // Extract only changed lines for scanning
    const changedText = extractChangedLines(diff).join("\n");

    // SEO hard-block scan on changed lines only
    const seoFlags = detectSeoHardBlocks(changedText);
    if (seoFlags.length > 0) {
      return [{
        evaluator: "diff-check",
        vote: "NO",
        reason: `Diff contains prohibited changes: ${seoFlags.join(", ")}`,
        risk: 0.95,
      }];
    }

    return [{
      evaluator: "diff-check",
      vote: "YES",
      reason: `Diff matches approved ${proposal["fix_category"]} fix for ${approvedFile}`,
      risk: 0.1,
    }];
  },
});

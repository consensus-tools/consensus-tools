import { createGuardTemplate } from "../templates.js";
import { detectSeoHardBlocks } from "./seo-taxonomy.js";
import { isAllowedSeoFile } from "./seo-allowed-files.js";
import type { GuardVote } from "@consensus-tools/schemas";

const ALLOWED_CATEGORIES = new Set([
  "meta_tag",
  "structured_data",
  "sitemap",
  "robots",
  "canonical",
  "alt_text",
  "head_tag",
]);

const RISK_SCORES: Record<string, number> = {
  meta_tag: 0.15,
  robots: 0.15,
  sitemap: 0.15,
  canonical: 0.15,
  alt_text: 0.15,
  structured_data: 0.35,
  head_tag: 0.35,
};

export const seoFixTemplate = createGuardTemplate("seo_fix", {
  description: "Evaluates proposed SEO fixes against allowed categories, file paths, and GSC evidence",
  // NOTE: Do NOT pass hardBlockPatterns here — we call detectSeoHardBlocks() manually
  // inside rules() to get domain-specific flag names (DESIGN_MUTATION, etc.) instead
  // of the generic "Hard-block pattern matched" message from the built-in scanner.
  rules(payload): GuardVote[] {
    const category = String(payload["fix_category"] || "");
    const filePath = String(payload["file_path"] || "");
    const description = String(payload["description"] || "");
    const proposedChange = String(payload["proposed_change"] || "");
    const evidence = (payload["gsc_evidence"] || {}) as Record<string, unknown>;
    const affectedUrls = (evidence["affected_urls"] || []) as string[];
    const issueType = String(evidence["issue_type"] || "other");

    // SEO-specific hard-block scan on description + proposed_change
    const seoFlags = detectSeoHardBlocks(description + "\n" + proposedChange);
    if (seoFlags.length > 0) {
      return [{
        evaluator: "seo-fix",
        vote: "NO",
        reason: `SEO hard-block: ${seoFlags.join(", ")}`,
        risk: 0.95,
      }];
    }

    // Category check
    if (!ALLOWED_CATEGORIES.has(category)) {
      return [{
        evaluator: "seo-fix",
        vote: "NO",
        reason: `Unknown or disallowed fix category: "${category}"`,
        risk: 0.9,
      }];
    }

    // File path check
    if (!isAllowedSeoFile(filePath)) {
      return [{
        evaluator: "seo-fix",
        vote: "NO",
        reason: `File path not in SEO allowlist: "${filePath}"`,
        risk: 0.9,
      }];
    }

    // Evidence check
    if (affectedUrls.length === 0 || (issueType === "other" && !evidence["impressions"])) {
      return [{
        evaluator: "seo-fix",
        vote: "REWRITE",
        reason: "Insufficient GSC evidence — provide affected URLs and specific issue type",
        risk: 0.5,
      }];
    }

    // Risk scoring
    let risk = RISK_SCORES[category] ?? 0.4;
    if (/next\.config/i.test(filePath)) {
      risk = Math.max(risk, 0.55);
    }

    return [{
      evaluator: "seo-fix",
      vote: "YES",
      reason: `Valid ${category} fix for ${affectedUrls.length} URL(s) — ${issueType}`,
      risk,
    }];
  },
});

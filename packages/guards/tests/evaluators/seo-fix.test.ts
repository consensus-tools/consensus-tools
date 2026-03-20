import { describe, it, expect } from "vitest";
import {
  SEO_HARD_BLOCK_PATTERNS,
  detectSeoHardBlocks,
} from "../../src/evaluators/seo-taxonomy.js";

describe("SEO hard-block taxonomy", () => {
  describe("DESIGN_MUTATION", () => {
    it("detects className changes", () => {
      const result = detectSeoHardBlocks('className="new-style"');
      expect(result).toContain("DESIGN_MUTATION");
    });

    it("detects style= attributes", () => {
      const result = detectSeoHardBlocks('style={{ color: "red" }}');
      expect(result).toContain("DESIGN_MUTATION");
    });

    it("detects CSS module imports", () => {
      const result = detectSeoHardBlocks('import styles from "./page.module.css"');
      expect(result).toContain("DESIGN_MUTATION");
    });

    it("does NOT flag meta description containing 'style'", () => {
      const result = detectSeoHardBlocks('<meta name="description" content="Our style guide">');
      expect(result).not.toContain("DESIGN_MUTATION");
    });
  });

  describe("ROUTE_CHANGE", () => {
    it("detects redirect rules", () => {
      const result = detectSeoHardBlocks("redirects: [{ source: '/old', destination: '/new' }]");
      expect(result).toContain("ROUTE_CHANGE");
    });

    it("detects rewrite rules", () => {
      const result = detectSeoHardBlocks("rewrites: [{ source: '/api', destination: '/v2' }]");
      expect(result).toContain("ROUTE_CHANGE");
    });

    it("detects page.tsx path references", () => {
      const result = detectSeoHardBlocks("app/dashboard/settings/page.tsx");
      expect(result).toContain("ROUTE_CHANGE");
    });
  });

  describe("CONTENT_REWRITE", () => {
    it("detects long visible text changes", () => {
      const result = detectSeoHardBlocks(">This is a paragraph of visible content that users will read<");
      expect(result).toContain("CONTENT_REWRITE");
    });
  });

  it("returns empty array for clean SEO content", () => {
    const result = detectSeoHardBlocks('<meta name="description" content="A short desc">');
    expect(result).toEqual([]);
  });
});

import { seoFixTemplate } from "../../src/evaluators/seo-fix.js";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";

function makeSeoInput(payload: Record<string, unknown>): GuardEvaluateInput {
  return { boardId: "test-board", action: { type: "seo_fix", payload } };
}

describe("seo_fix evaluator", () => {
  it("ALLOWs valid meta_tag fix with evidence", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "meta_tag",
        file_path: "app/layout.tsx",
        description: "Add meta description for homepage",
        proposed_change: '<meta name="description" content="Consensus board for governance">',
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "crawled_not_indexed",
          impressions: 100,
        },
      }),
    );
    expect(votes[0]!.vote).toBe("YES");
    expect(votes[0]!.risk).toBeLessThanOrEqual(0.2);
  });

  it("BLOCKs unknown fix category", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "rewrite_copy",
        file_path: "app/layout.tsx",
        description: "Rewrite the homepage copy",
        proposed_change: "new copy here",
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "not_indexed",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("NO");
  });

  it("BLOCKs disallowed file paths", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "meta_tag",
        file_path: "components/Hero.tsx",
        description: "Add meta tag",
        proposed_change: '<meta name="description">',
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "not_indexed",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("NO");
  });

  it("REWRITEs when GSC evidence is empty", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "meta_tag",
        file_path: "app/layout.tsx",
        description: "Add meta description",
        proposed_change: '<meta name="description">',
        gsc_evidence: {
          affected_urls: [],
          issue_type: "other",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("REWRITE");
  });

  it("hard-blocks proposals with className in proposed_change", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "meta_tag",
        file_path: "app/layout.tsx",
        description: "Update head section",
        proposed_change: '<div className="hero-banner">New section</div>',
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "not_indexed",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("NO");
    expect(votes[0]!.reason).toContain("DESIGN_MUTATION");
  });

  it("assigns higher risk for next.config changes", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "head_tag",
        file_path: "next.config.mjs",
        description: "Add security headers for crawlers",
        proposed_change: "headers config",
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "not_indexed",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("YES");
    expect(votes[0]!.risk).toBeGreaterThanOrEqual(0.5);
  });
});

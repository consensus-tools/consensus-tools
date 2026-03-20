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

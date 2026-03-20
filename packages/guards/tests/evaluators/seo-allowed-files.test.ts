import { describe, it, expect } from "vitest";
import { isAllowedSeoFile } from "../../src/evaluators/seo-allowed-files.js";

describe("SEO file path allowlist", () => {
  it("allows robots.txt", () => {
    expect(isAllowedSeoFile("robots.txt")).toBe(true);
  });

  it("allows app/robots.ts", () => {
    expect(isAllowedSeoFile("app/robots.ts")).toBe(true);
  });

  it("allows sitemap.xml", () => {
    expect(isAllowedSeoFile("sitemap.xml")).toBe(true);
  });

  it("allows app/sitemap.ts", () => {
    expect(isAllowedSeoFile("app/sitemap.ts")).toBe(true);
  });

  it("allows layout.tsx", () => {
    expect(isAllowedSeoFile("app/layout.tsx")).toBe(true);
  });

  it("allows nested layout.tsx", () => {
    expect(isAllowedSeoFile("app/(web)/layout.tsx")).toBe(true);
  });

  it("blocks CSS files", () => {
    expect(isAllowedSeoFile("app/globals.css")).toBe(false);
  });

  it("blocks component files", () => {
    expect(isAllowedSeoFile("components/Hero.tsx")).toBe(false);
  });

  it("blocks page.tsx files (route definitions)", () => {
    expect(isAllowedSeoFile("app/about/page.tsx")).toBe(false);
  });

  it("allows next.config.mjs", () => {
    expect(isAllowedSeoFile("next.config.mjs")).toBe(true);
  });

  it("allows MDX frontmatter files", () => {
    expect(isAllowedSeoFile("content/docs/intro.mdx")).toBe(true);
  });
});

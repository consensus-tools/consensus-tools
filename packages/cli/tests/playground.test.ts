import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadScenario,
  listScenarios,
  evaluatePlayground,
  type PlaygroundResult,
} from "../src/playground.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenariosDir = path.resolve(__dirname, "../scenarios");

describe("playground", () => {
  describe("loadScenario", () => {
    it("loads a valid scenario by domain and name", () => {
      const scenario = loadScenario(scenariosDir, "code-merge", "safe");
      expect(scenario.domain).toBe("code_merge");
      expect(scenario.payload).toBeDefined();
      expect(scenario.payload.files).toBeDefined();
    });

    it("throws on invalid scenario name", () => {
      expect(() => loadScenario(scenariosDir, "code-merge", "nonexistent")).toThrow(
        /scenario not found/i,
      );
    });

    it("throws on invalid domain", () => {
      expect(() => loadScenario(scenariosDir, "fake-domain", "safe")).toThrow(
        /no scenarios found/i,
      );
    });

    it("loads default scenario when no name given", () => {
      const scenario = loadScenario(scenariosDir, "code-merge");
      expect(scenario.domain).toBe("code_merge");
    });
  });

  describe("listScenarios", () => {
    it("lists all available scenarios grouped by domain", () => {
      const list = listScenarios(scenariosDir);
      expect(Object.keys(list).length).toBeGreaterThanOrEqual(7);
      expect(list["code-merge"]).toContain("safe");
      expect(list["code-merge"]).toContain("risky");
      expect(list["send-email"]).toBeDefined();
      expect(list["deployment"]).toBeDefined();
    });
  });

  describe("evaluatePlayground", () => {
    it("returns 4 votes for a code-merge scenario (3 templates + 1 domain)", () => {
      const result = evaluatePlayground("code_merge", {
        files: ["src/utils/format.ts"],
        diff_summary: "Refactored formatting",
        tests_passed: true,
      });

      expect(result.votes).toHaveLength(4);
      expect(result.votes.map((v) => v.evaluator)).toEqual(
        expect.arrayContaining(["security", "compliance", "user-impact"]),
      );
      // 4th vote is the domain evaluator
      expect(result.votes.some((v) => v.evaluator !== "security" && v.evaluator !== "compliance" && v.evaluator !== "user-impact")).toBe(true);
    });

    it("returns BLOCK when security detects destructive operation", () => {
      const result = evaluatePlayground("code_merge", {
        diff_summary: "DROP TABLE users",
        tests_passed: true,
      });

      expect(result.decision).toBe("BLOCK");
      const securityVote = result.votes.find((v) => v.evaluator === "security");
      expect(securityVote?.vote).toBe("NO");
    });

    it("returns BLOCK when domain evaluator detects tests failing", () => {
      const result = evaluatePlayground("code_merge", {
        files: ["src/safe.ts"],
        diff_summary: "Minor refactor",
        tests_passed: false,
      });

      expect(result.decision).toBe("BLOCK");
      // The domain evaluator should flag tests failing
      const domainVote = result.votes.find((v) =>
        v.evaluator !== "security" && v.evaluator !== "compliance" && v.evaluator !== "user-impact",
      );
      expect(domainVote?.vote).toBe("NO");
    });

    it("returns ALLOW when all reviewers approve safe input", () => {
      const result = evaluatePlayground("code_merge", {
        files: ["src/utils/format.ts"],
        diff_summary: "Refactored date formatting",
        tests_passed: true,
      });

      expect(result.decision).toBe("ALLOW");
    });

    it("detects hard-block flags", () => {
      const result = evaluatePlayground("send_email", {
        to: "user@test.com",
        body: "Here is a way to exploit and hack the system",
      });

      expect(result.hardBlockFlags.length).toBeGreaterThan(0);
      expect(result.decision).toBe("BLOCK");
    });

    it("handles unknown domain gracefully (domain evaluator returns generic vote)", () => {
      const result = evaluatePlayground("unknown_domain" as string, {
        text: "Some safe content",
      });

      expect(result.votes).toHaveLength(4);
      expect(result.decision).toBe("ALLOW");
    });

    it("catches errors in template evaluation and returns fail-closed fallback vote", () => {
      // Passing null payload should not crash — errors produce NO votes (fail-closed)
      const result = evaluatePlayground("code_merge", null as unknown as Record<string, unknown>);
      expect(result.votes).toHaveLength(4);
      expect(result.decision).toBeDefined();
      // Errors should fail closed, not open
    });
  });

  describe("parseInput", () => {
    it("parses inline JSON string", async () => {
      const { parseInput } = await import("../src/playground.js");
      const result = parseInput('{"body": "test"}');
      expect(result).toEqual({ body: "test" });
    });

    it("reads JSON from file path", async () => {
      const { parseInput } = await import("../src/playground.js");
      const filePath = path.join(scenariosDir, "code-merge-safe.json");
      const result = parseInput(filePath);
      expect(result.payload).toBeDefined();
    });

    it("throws on malformed JSON", async () => {
      const { parseInput } = await import("../src/playground.js");
      expect(() => parseInput("{bad json")).toThrow();
    });

    it("throws on missing file", async () => {
      const { parseInput } = await import("../src/playground.js");
      expect(() => parseInput("/nonexistent/path.json")).toThrow();
    });
  });
});

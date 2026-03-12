import { describe, it, expect } from "vitest";
import { prompts, getPrompt } from "../src/prompts.js";

describe("prompts", () => {
  describe("prompts array", () => {
    it("has 3 entries with expected names", () => {
      expect(prompts).toHaveLength(3);
      const names = prompts.map((p) => p.name);
      expect(names).toContain("post-job");
      expect(names).toContain("review-submission");
      expect(names).toContain("guard-evaluate");
    });
  });

  describe("getPrompt", () => {
    it("returns messages for post-job", () => {
      const result = getPrompt("post-job", { title: "Test" });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content.type).toBe("text");
      expect(result.messages[0].content.text).toContain("Test");
    });

    it("returns messages for review-submission", () => {
      const result = getPrompt("review-submission", { jobId: "j1" });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content.text).toContain("j1");
    });

    it("throws for unknown prompt name", () => {
      expect(() => getPrompt("nonexistent", {})).toThrow("Unknown prompt: nonexistent");
    });
  });
});

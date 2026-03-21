import { describe, it, expect } from "vitest";
import { mockProposal } from "../lib/proposer.js";
import type { SkillAgent } from "../lib/types.js";

const agent: SkillAgent = {
  id: "test-agent",
  name: "Test Agent",
  role: "test",
  systemPrompt: "You are a test agent.",
  evaluationFocus: "testing",
  reputation: 100,
};

describe("mockProposal", () => {
  it("returns a proposal with modified content", () => {
    const result = mockProposal(agent, "browse", "# Original content");
    expect(result.agentId).toBe("test-agent");
    expect(result.skillName).toBe("browse");
    expect(result.originalContent).toBe("# Original content");
    expect(result.proposedContent).toContain("# Original content");
    expect(result.proposedContent).toContain("Improved by Test Agent");
    expect(result.proposedContent).not.toBe(result.originalContent);
  });

  it("includes agent focus in change summary", () => {
    const result = mockProposal(agent, "qa", "content");
    expect(result.changeSummary).toContain("testing");
  });
});

describe("proposeImprovement parse logic", () => {
  // Test the parsing logic by simulating what proposeImprovement does internally.
  // We can't call the real function without an LLM, but we can test the regex.

  const CHANGE_SUMMARY_RE = /CHANGE_SUMMARY:\s*(.+)/i;
  const PROPOSED_CONTENT_RE = /---PROPOSED_CONTENT---\n([\s\S]+)$/i;

  it("extracts summary and content from well-formed response", () => {
    const text = `CHANGE_SUMMARY: Added error handling section
---PROPOSED_CONTENT---
# SKILL.md
## Commands
New content here`;

    const summary = CHANGE_SUMMARY_RE.exec(text)?.[1]?.trim();
    const content = PROPOSED_CONTENT_RE.exec(text)?.[1]?.trim();
    expect(summary).toBe("Added error handling section");
    expect(content).toBe("# SKILL.md\n## Commands\nNew content here");
  });

  it("returns null content when delimiter is missing", () => {
    const text = "Here's my improvement to the document:\n# SKILL.md\nBetter content";
    const content = PROPOSED_CONTENT_RE.exec(text)?.[1]?.trim();
    expect(content).toBeUndefined();
  });

  it("returns null content when response is empty", () => {
    const content = PROPOSED_CONTENT_RE.exec("")?.[1]?.trim();
    expect(content).toBeUndefined();
  });

  it("handles response with summary but no content delimiter", () => {
    const text = "CHANGE_SUMMARY: Made things better\nBut I forgot the delimiter";
    const summary = CHANGE_SUMMARY_RE.exec(text)?.[1]?.trim();
    const content = PROPOSED_CONTENT_RE.exec(text)?.[1]?.trim();
    expect(summary).toBe("Made things better");
    expect(content).toBeUndefined();
  });

  it("handles multiline content after delimiter", () => {
    const text = `CHANGE_SUMMARY: Big change
---PROPOSED_CONTENT---
---
name: browse
---
# Browse

## Commands
| Command | Desc |
|---------|------|
| goto | Navigate |`;

    const content = PROPOSED_CONTENT_RE.exec(text)?.[1]?.trim();
    expect(content).toContain("name: browse");
    expect(content).toContain("| goto | Navigate |");
  });
});

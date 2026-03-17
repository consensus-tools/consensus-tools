import { describe, test, expect } from "vitest";
import { parseVote } from "../src/vote-parser.js";
import type { AgentWithRep } from "../src/vote-parser.js";

const agent: AgentWithRep = {
  id: "test-agent",
  name: "Test Agent",
  role: "testing",
  systemPrompt: "You are a test agent.",
  evaluationFocus: "testing",
  reputation: 100,
};

describe("parseVote", () => {
  test("valid YES response", () => {
    const v = parseVote("VOTE: YES | RISK: 0.1 | REASON: all good", agent);
    expect(v.vote).toBe("YES");
    expect(v.risk).toBe(0.1);
    expect(v.reason).toBe("all good");
    expect(v.agentId).toBe("test-agent");
    expect(v.reputation).toBe(100);
  });

  test("valid NO response", () => {
    const v = parseVote("VOTE: NO | RISK: 0.95 | REASON: fabricated command", agent);
    expect(v.vote).toBe("NO");
    expect(v.risk).toBe(0.95);
  });

  test("valid REWRITE response", () => {
    const v = parseVote("VOTE: REWRITE | RISK: 0.6 | REASON: wrong flag", agent);
    expect(v.vote).toBe("REWRITE");
    expect(v.risk).toBe(0.6);
  });

  test("malformed input defaults to REWRITE", () => {
    const v = parseVote("This is some random analysis text", agent);
    expect(v.vote).toBe("REWRITE");
    expect(v.risk).toBe(0.5);
  });

  test("empty string defaults to REWRITE", () => {
    const v = parseVote("", agent);
    expect(v.vote).toBe("REWRITE");
    expect(v.risk).toBe(0.5);
  });

  test("risk clamped to [0, 1]", () => {
    const v = parseVote("VOTE: YES | RISK: 1.5 | REASON: ok", agent);
    expect(v.risk).toBe(1);
  });

  test("case insensitive vote matching", () => {
    const v = parseVote("vote: yes | risk: 0.2 | reason: fine", agent);
    expect(v.vote).toBe("YES");
  });
});

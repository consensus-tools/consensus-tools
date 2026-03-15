import { describe, it, expect } from "vitest";
import { formatHitlMessage } from "../lib/hitl.js";

describe("HITL Message Formatting", () => {
  const sampleVotes = [
    { evaluator: "security-analyst", vote: "REWRITE", risk: 0.72, reason: "Refund commitment language detected" },
    { evaluator: "compliance-officer", vote: "NO", risk: 0.65, reason: "Missing disclaimer for legal context" },
    { evaluator: "operations-engineer", vote: "YES", risk: 0.15, reason: "No operational concerns" },
  ];

  it("returns channel, sender, and text fields", () => {
    const msg = formatHitlMessage("run_abc123", sampleVotes, 0.72, 0.5);
    expect(msg.channel).toBe("#guard-approvals");
    expect(msg.sender).toBe("Guard Bot");
    expect(typeof msg.text).toBe("string");
  });

  it("includes run ID in message", () => {
    const msg = formatHitlMessage("run_xyz", sampleVotes, 0.6, 0.5);
    expect(msg.text).toContain("run_xyz");
  });

  it("includes risk and threshold percentages", () => {
    const msg = formatHitlMessage("run_1", sampleVotes, 0.72, 0.5);
    expect(msg.text).toContain("72%");
    expect(msg.text).toContain("50%");
  });

  it("includes all guard votes", () => {
    const msg = formatHitlMessage("run_1", sampleVotes, 0.72, 0.5);
    expect(msg.text).toContain("security-analyst");
    expect(msg.text).toContain("REWRITE");
    expect(msg.text).toContain("compliance-officer");
    expect(msg.text).toContain("NO");
    expect(msg.text).toContain("operations-engineer");
    expect(msg.text).toContain("YES");
  });

  it("includes action instructions", () => {
    const msg = formatHitlMessage("run_1", sampleVotes, 0.72, 0.5);
    expect(msg.text).toContain("APPROVE");
    expect(msg.text).toContain("REJECT");
    expect(msg.text).toContain("REVISE");
  });
});

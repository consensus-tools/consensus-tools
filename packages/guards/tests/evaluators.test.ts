import { describe, it, expect } from "vitest";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";
import { evaluatorVotes } from "../src/evaluators.js";

function makeInput(type: string, payload: Record<string, unknown> = {}): GuardEvaluateInput {
  return { boardId: "test-board", action: { type, payload } };
}

describe("evaluatorVotes", () => {
  describe("send_email", () => {
    it("blocks external email with attachment", () => {
      const votes = evaluatorVotes(makeInput("send_email", { to: "user@ext.com", attachment: true }));
      expect(votes).toHaveLength(1);
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].risk).toBeGreaterThan(0.9);
    });

    it("blocks email body with secrets patterns", () => {
      for (const keyword of ["apiKey", "api_key", "token", "password", "secret"]) {
        const votes = evaluatorVotes(makeInput("send_email", { body: `Here is your ${keyword}: abc123` }));
        expect(votes[0].vote).toBe("NO");
        expect(votes[0].reason).toContain("secrets-like");
      }
    });

    it("allows clean email", () => {
      const votes = evaluatorVotes(makeInput("send_email", { to: "user@ext.com", body: "Hello!" }));
      expect(votes[0].vote).toBe("YES");
      expect(votes[0].risk).toBeLessThan(0.5);
    });
  });

  describe("code_merge", () => {
    it("flags merge touching auth files", () => {
      const votes = evaluatorVotes(makeInput("code_merge", { files: ["src/auth/login.ts"] }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].risk).toBeGreaterThan(0.8);
    });

    it("flags security and crypto files", () => {
      for (const file of ["lib/security.ts", "crypto/keys.ts", "permissions/acl.ts"]) {
        const votes = evaluatorVotes(makeInput("code_merge", { files: [file] }));
        expect(votes[0].vote).toBe("REWRITE");
      }
    });

    it("allows safe file merge", () => {
      const votes = evaluatorVotes(makeInput("code_merge", { files: ["src/utils/format.ts"] }));
      expect(votes[0].vote).toBe("YES");
      expect(votes[0].risk).toBeLessThan(0.5);
    });
  });

  describe("publish", () => {
    it("flags profanity", () => {
      const votes = evaluatorVotes(makeInput("publish", { text: "This is damn wrong" }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].reason).toContain("Profanity");
    });

    it("flags SSN-like patterns", () => {
      const votes = evaluatorVotes(makeInput("publish", { text: "SSN: 123-45-6789" }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].reason).toContain("personal-data");
    });

    it("allows clean text", () => {
      const votes = evaluatorVotes(makeInput("publish", { text: "Great product update!" }));
      expect(votes[0].vote).toBe("YES");
      expect(votes[0].risk).toBeLessThan(0.5);
    });
  });

  describe("support_reply", () => {
    it("flags refund language", () => {
      const votes = evaluatorVotes(makeInput("support_reply", { message: "I want a refund now" }));
      expect(votes[0].vote).toBe("REWRITE");
    });

    it("flags legal action language", () => {
      const votes = evaluatorVotes(makeInput("support_reply", { message: "We will take legal action" }));
      expect(votes[0].vote).toBe("REWRITE");
    });

    it("allows standard reply", () => {
      const votes = evaluatorVotes(makeInput("support_reply", { message: "Thank you for reaching out" }));
      expect(votes[0].vote).toBe("YES");
      expect(votes[0].risk).toBeLessThan(0.5);
    });
  });

  describe("agent_action", () => {
    it("blocks irreversible action", () => {
      const votes = evaluatorVotes(makeInput("agent_action", { irreversible: true }));
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].risk).toBeGreaterThan(0.8);
    });

    it("allows reversible action", () => {
      const votes = evaluatorVotes(makeInput("agent_action", { irreversible: false }));
      expect(votes[0].vote).toBe("YES");
    });
  });

  describe("deployment", () => {
    it("flags prod deployment", () => {
      const votes = evaluatorVotes(makeInput("deployment", { env: "prod" }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].risk).toBeGreaterThan(0.7);
    });

    it("allows non-prod deployment", () => {
      const votes = evaluatorVotes(makeInput("deployment", { env: "staging" }));
      expect(votes[0].vote).toBe("YES");
      expect(votes[0].risk).toBeLessThan(0.5);
    });
  });

  describe("permission_escalation", () => {
    it("flags break-glass escalation", () => {
      const votes = evaluatorVotes(makeInput("permission_escalation", { breakGlass: true }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].risk).toBeGreaterThan(0.85);
    });

    it("allows standard permission change", () => {
      const votes = evaluatorVotes(makeInput("permission_escalation", { breakGlass: false }));
      expect(votes[0].vote).toBe("YES");
    });
  });

  it("returns generic YES for unknown action type", () => {
    const votes = evaluatorVotes(makeInput("unknown_type"));
    expect(votes).toHaveLength(1);
    expect(votes[0].evaluator).toBe("generic");
    expect(votes[0].vote).toBe("YES");
  });
});

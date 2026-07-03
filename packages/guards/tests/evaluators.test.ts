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

    it("detects hard-block flags in email body", () => {
      const votes = evaluatorVotes(makeInput("send_email", { body: "Here is the confidential NDA document" }));
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].reason).toContain("Hard-block flags");
      expect(votes[0].reason).toContain("CONFIDENTIALITY_BREACH");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.95);
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

    it("blocks when tests are failing", () => {
      const votes = evaluatorVotes(makeInput("code_merge", { files: ["src/utils.ts"], tests_passed: false }));
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].reason).toContain("Tests failing");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.9);
    });

    it("blocks when diff contains security vulnerability patterns", () => {
      const votes = evaluatorVotes(makeInput("code_merge", {
        files: ["src/query.ts"],
        diff_summary: "Fixed SQL injection vulnerability in user input handling",
      }));
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].reason).toContain("Security vulnerability");
      expect(votes[0].risk).toBeGreaterThan(0.9);
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

    it("flags guarantee/legal/medical claims via taxonomy", () => {
      const guaranteeVotes = evaluatorVotes(makeInput("publish", { text: "We guarantee this will work" }));
      expect(guaranteeVotes[0].vote).toBe("REWRITE");
      expect(guaranteeVotes[0].reason).toContain("Content flags");
      expect(guaranteeVotes[0].reason).toContain("DISALLOWED_GUARANTEE");

      const legalVotes = evaluatorVotes(makeInput("publish", { text: "With legal certainty we are liable" }));
      expect(legalVotes[0].vote).toBe("REWRITE");
      expect(legalVotes[0].reason).toContain("LEGAL_CLAIM");

      const medicalVotes = evaluatorVotes(makeInput("publish", { text: "This will cure your illness" }));
      expect(medicalVotes[0].vote).toBe("REWRITE");
      expect(medicalVotes[0].reason).toContain("MEDICAL_CLAIM");
    });

    it("reads body field as fallback for text", () => {
      const votes = evaluatorVotes(makeInput("publish", { body: "This is damn wrong" }));
      expect(votes[0].vote).toBe("REWRITE");
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

    it("flags taxonomy hard-block flags", () => {
      const votes = evaluatorVotes(makeInput("support_reply", { message: "I will hack your system and exploit it" }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].reason).toContain("Safety flags");
      expect(votes[0].reason).toContain("WRONGDOING_INSTRUCTION");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.8);
    });

    it("reads body field as fallback for message", () => {
      const votes = evaluatorVotes(makeInput("support_reply", { body: "I want a refund" }));
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

    it("blocks irreversible+high-risk with higher risk score", () => {
      const votes = evaluatorVotes(makeInput("agent_action", { irreversible: true, risk_level: "high" }));
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.95);
    });

    it("flags external side effects", () => {
      const votes = evaluatorVotes(makeInput("agent_action", { external_side_effect: true }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].reason).toContain("External side effect");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.6);
    });

    it("allows reversible action", () => {
      const votes = evaluatorVotes(makeInput("agent_action", { irreversible: false }));
      expect(votes[0].vote).toBe("YES");
    });
  });

  describe("deployment", () => {
    it("blocks when CI checks failed", () => {
      const votes = evaluatorVotes(makeInput("deployment", { env: "prod", ci_passed: false }));
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].reason).toContain("CI checks failed");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.95);
    });

    it("blocks missing rollback plan", () => {
      const votes = evaluatorVotes(makeInput("deployment", { env: "prod", requires_rollback: true, has_rollback: false }));
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].reason).toContain("Missing rollback plan");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.9);
    });

    it("flags prod deployment", () => {
      const votes = evaluatorVotes(makeInput("deployment", { env: "prod" }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].risk).toBeGreaterThan(0.7);
    });

    it("allows staging deployment", () => {
      const votes = evaluatorVotes(makeInput("deployment", { env: "staging" }));
      expect(votes[0].vote).toBe("YES");
      expect(votes[0].risk).toBeLessThan(0.5);
    });

    it("allows dev deployment", () => {
      const votes = evaluatorVotes(makeInput("deployment", { env: "dev" }));
      expect(votes[0].vote).toBe("YES");
      expect(votes[0].risk).toBeLessThan(0.5);
    });
  });

  describe("permission_escalation", () => {
    it("blocks wildcard permission", () => {
      const votes = evaluatorVotes(makeInput("permission_escalation", { permission: "*" }));
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].reason).toContain("Wildcard");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.95);
    });

    it("blocks wildcard resource", () => {
      const votes = evaluatorVotes(makeInput("permission_escalation", { resource: "*" }));
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].reason).toContain("Wildcard");
    });

    it("flags break-glass escalation", () => {
      const votes = evaluatorVotes(makeInput("permission_escalation", { breakGlass: true }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].risk).toBeGreaterThan(0.85);
    });

    it("flags admin role escalation", () => {
      const votes = evaluatorVotes(makeInput("permission_escalation", { target_role: "admin" }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].reason).toContain("Admin/superuser");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.8);
    });

    it("flags superuser and root roles", () => {
      for (const role of ["superuser", "root"]) {
        const votes = evaluatorVotes(makeInput("permission_escalation", { target_role: role }));
        expect(votes[0].vote).toBe("REWRITE");
      }
    });

    it("allows standard permission change", () => {
      const votes = evaluatorVotes(makeInput("permission_escalation", { breakGlass: false }));
      expect(votes[0].vote).toBe("YES");
    });

    it("flags a scoped wildcard permission (iam:*)", () => {
      const votes = evaluatorVotes(makeInput("permission_escalation", { permission: "iam:*" }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].reason).toContain("wildcard");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.85);
    });

    it("blocks a bare wildcard anywhere in requestedPermissions", () => {
      const votes = evaluatorVotes(
        makeInput("permission_escalation", { requestedPermissions: ["s3:read", "*"] }),
      );
      expect(votes[0].vote).toBe("NO");
      expect(votes[0].reason).toContain("Wildcard");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.95);
    });

    it("flags a scoped wildcard in a non-first requestedPermissions entry", () => {
      const votes = evaluatorVotes(
        makeInput("permission_escalation", { requestedPermissions: ["s3:read", "iam:*"] }),
      );
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].reason).toContain("wildcard");
    });

    it("scans requestedPermissions even when a benign `permission` is also present", () => {
      const votes = evaluatorVotes(
        makeInput("permission_escalation", { permission: "s3:read", requestedPermissions: ["admin:*"] }),
      );
      expect(votes[0].vote).toBe("REWRITE");
    });

    it("break-glass outranks a scoped wildcard when both are present", () => {
      const votes = evaluatorVotes(
        makeInput("permission_escalation", { breakGlass: true, permission: "iam:*" }),
      );
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].reason).toContain("Break-glass");
      // Adding a risk factor must never LOWER the score below break-glass alone (0.9).
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.9);
    });

    it("allows a list of scoped, non-wildcard permissions", () => {
      const votes = evaluatorVotes(
        makeInput("permission_escalation", { requestedPermissions: ["s3:read", "s3:write", "logs:read"] }),
      );
      expect(votes[0].vote).toBe("YES");
    });

    it("flags a scoped wildcard resource (prod-*), matching the permission side", () => {
      const votes = evaluatorVotes(makeInput("permission_escalation", { resource: "prod-*" }));
      expect(votes[0].vote).toBe("REWRITE");
      expect(votes[0].reason).toContain("wildcard");
      expect(votes[0].risk).toBeGreaterThanOrEqual(0.85);
    });
  });

  it("returns generic YES for unknown action type", () => {
    const votes = evaluatorVotes(makeInput("unknown_type"));
    expect(votes).toHaveLength(1);
    expect(votes[0].evaluator).toBe("generic");
    expect(votes[0].vote).toBe("YES");
  });
});

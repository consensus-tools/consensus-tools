import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";
import { JsonStorage } from "@consensus-tools/storage";
import { GuardHandler } from "../src/handler.js";

/**
 * Direction parity tests — verify the unified GuardHandler produces the same
 * allow/block/rewrite direction as the original standalone consensus-*-guard
 * packages.
 *
 * We don't match exact JSON shapes (the unified handler uses computeDecision()
 * with 4 outcomes while outer guards had 3 domain-specific outcomes), but we
 * verify that blocking inputs still block and allowing inputs still allow.
 */

let tmpDir: string;
let counter = 0;

function makeTempStorage(): JsonStorage {
  counter++;
  const filePath = path.join(tmpDir, `parity-${counter}.json`);
  return new JsonStorage(filePath);
}

function makeHandler(storage: JsonStorage): GuardHandler {
  return new GuardHandler({ storage, enableLogging: false });
}

function makeInput(
  type: string,
  payload: Record<string, unknown>,
  boardId?: string,
): GuardEvaluateInput {
  return {
    boardId: boardId ?? `parity-${type}-${counter}-${Date.now()}`,
    action: { type, payload },
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "guards-parity-"));
  counter = 0;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// agent-action-guard parity
// ---------------------------------------------------------------------------
describe("agent-action-guard parity", () => {
  it("high_risk + irreversible → BLOCK", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("agent_action", { irreversible: true, risk_level: "high" }),
    );
    expect(result.decision).toBe("BLOCK");
    expect(result.risk_score).toBeGreaterThan(0.7);
  });

  it("reversible + low risk → ALLOW", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("agent_action", { irreversible: false, risk_level: "low" }),
    );
    expect(result.decision).toBe("ALLOW");
  });
});

// ---------------------------------------------------------------------------
// code-merge-guard parity
// ---------------------------------------------------------------------------
describe("code-merge-guard parity", () => {
  it("tests failing → BLOCK", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("code_merge", { tests_passed: false }),
    );
    expect(result.decision).toBe("BLOCK");
  });

  it("security flag in diff → BLOCK", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("code_merge", {
        tests_passed: true,
        diff_summary: "Fixed SQL injection vulnerability in auth module",
      }),
    );
    expect(result.decision).toBe("BLOCK");
  });

  it("clean merge → ALLOW", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("code_merge", {
        tests_passed: true,
        files: ["README.md"],
        diff_summary: "Updated readme formatting",
      }),
    );
    expect(result.decision).toBe("ALLOW");
  });
});

// ---------------------------------------------------------------------------
// publish-guard parity
// ---------------------------------------------------------------------------
describe("publish-guard parity", () => {
  it("guarantee language → BLOCK or REWRITE", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("publish", { text: "We guarantee 100% uptime for all users" }),
    );
    // Hard-block flag "DISALLOWED_GUARANTEE" detected in text →
    // handler.extractText picks up "text" field → detectHardBlockFlags fires.
    expect(["BLOCK", "REWRITE"]).toContain(result.decision);
  });

  it("clean content → ALLOW", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("publish", { text: "Check out our new feature release notes." }),
    );
    expect(result.decision).toBe("ALLOW");
  });
});

// ---------------------------------------------------------------------------
// deployment-guard parity
// ---------------------------------------------------------------------------
describe("deployment-guard parity", () => {
  it("prod with failed CI → BLOCK", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("deployment", { env: "prod", ci_passed: false }),
    );
    expect(result.decision).toBe("BLOCK");
  });

  it("staging → ALLOW", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("deployment", { env: "staging", ci_passed: true }),
    );
    expect(result.decision).toBe("ALLOW");
  });
});

// ---------------------------------------------------------------------------
// support-reply-guard parity
// ---------------------------------------------------------------------------
describe("support-reply-guard parity", () => {
  it("threat/escalation language → BLOCK or REWRITE", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("support_reply", {
        message: "I will file a lawsuit if this is not resolved immediately",
      }),
    );
    // "lawsuit" triggers both LEGAL_CLAIM hard-block and escalation evaluator
    expect(["BLOCK", "REWRITE"]).toContain(result.decision);
  });

  it("clean reply → ALLOW", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("support_reply", {
        message: "Thank you for reaching out. Your ticket has been updated.",
      }),
    );
    expect(result.decision).toBe("ALLOW");
  });
});

// ---------------------------------------------------------------------------
// permission-escalation-guard parity
// ---------------------------------------------------------------------------
describe("permission-escalation-guard parity", () => {
  it("wildcard permission → BLOCK", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("permission_escalation", { permission: "*", resource: "all" }),
    );
    expect(result.decision).toBe("BLOCK");
  });

  it("standard change → ALLOW", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("permission_escalation", {
        permission: "read",
        resource: "reports",
        target_role: "analyst",
      }),
    );
    expect(result.decision).toBe("ALLOW");
  });
});

// ---------------------------------------------------------------------------
// send-email-guard parity
// ---------------------------------------------------------------------------
describe("send-email-guard parity", () => {
  it("secrets in body → BLOCK", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("send_email", {
        to: "external@example.com",
        body: "Here is the api_key: sk-1234567890abcdef",
      }),
    );
    expect(result.decision).toBe("BLOCK");
  });

  it("clean email → ALLOW", async () => {
    const storage = makeTempStorage();
    const handler = makeHandler(storage);
    const result = await handler.evaluate(
      makeInput("send_email", {
        to: "team@company.com",
        body: "Meeting moved to 3pm tomorrow.",
      }),
    );
    expect(result.decision).toBe("ALLOW");
  });
});

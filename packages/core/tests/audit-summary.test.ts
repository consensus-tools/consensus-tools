import { describe, it, expect } from "vitest";
import { summarizeFromState, formatSummaryTable } from "../src/audit-summary.js";
import type { StorageState } from "@consensus-tools/schemas";
import { defaultState } from "@consensus-tools/storage";

function makeState(overrides: Partial<StorageState> = {}): StorageState {
  return { ...defaultState(), ...overrides };
}

describe("summarizeFromState", () => {
  it("returns empty summary when no guard results", () => {
    const state = makeState();
    const summary = summarizeFromState(state);
    expect(summary.rows).toEqual([]);
    expect(summary.stats.total).toBe(0);
    expect(summary.stats.avgRisk).toBe(0);
  });

  it("builds rows from guard results with timestamps from audit events", () => {
    const state = makeState({
      guardResults: [
        {
          decision: "BLOCK",
          reason: "High risk",
          risk_score: 0.85,
          audit_id: "audit-1",
          votes: [
            { evaluator: "security", vote: "NO", reason: "Dangerous", risk: 0.9 },
            { evaluator: "compliance", vote: "NO", reason: "Missing docs", risk: 0.8 },
          ],
          guard_type: "send_email",
        },
        {
          decision: "ALLOW",
          reason: "Low risk",
          risk_score: 0.15,
          audit_id: "audit-2",
          votes: [
            { evaluator: "security", vote: "YES", reason: "Safe", risk: 0.1 },
            { evaluator: "compliance", vote: "YES", reason: "Compliant", risk: 0.2 },
            { evaluator: "content", vote: "YES", reason: "Clean", risk: 0.1 },
          ],
          guard_type: "code_merge",
        },
      ],
      audit: [
        { id: "e1", at: "2026-03-25T14:32:01Z", type: "FINAL_DECISION", details: { auditId: "audit-1" } },
        { id: "e2", at: "2026-03-25T14:28:15Z", type: "FINAL_DECISION", details: { auditId: "audit-2" } },
      ],
    });

    const summary = summarizeFromState(state);
    expect(summary.rows).toHaveLength(2);
    // Most recent first
    expect(summary.rows[0].auditId).toBe("audit-1");
    expect(summary.rows[0].timestamp).toBe("2026-03-25T14:32:01Z");
    expect(summary.rows[0].decision).toBe("BLOCK");
    expect(summary.rows[0].voteSummary).toEqual({ yes: 0, no: 2, rewrite: 0 });
    expect(summary.rows[0].evaluators).toEqual(["security", "compliance"]);

    expect(summary.rows[1].auditId).toBe("audit-2");
    expect(summary.rows[1].decision).toBe("ALLOW");
    expect(summary.rows[1].voteSummary).toEqual({ yes: 3, no: 0, rewrite: 0 });

    expect(summary.stats.total).toBe(2);
    expect(summary.stats.byDecision).toEqual({ BLOCK: 1, ALLOW: 1 });
    expect(summary.stats.avgRisk).toBeCloseTo(0.5);
  });

  it("filters by domain", () => {
    const state = makeState({
      guardResults: [
        { decision: "BLOCK", reason: "r", risk_score: 0.8, audit_id: "a1", guard_type: "send_email" },
        { decision: "ALLOW", reason: "r", risk_score: 0.2, audit_id: "a2", guard_type: "code_merge" },
      ],
      audit: [
        { id: "e1", at: "2026-03-25T10:00:00Z", type: "FINAL_DECISION", details: { auditId: "a1" } },
        { id: "e2", at: "2026-03-25T11:00:00Z", type: "FINAL_DECISION", details: { auditId: "a2" } },
      ],
    });

    const summary = summarizeFromState(state, { domain: "send_email" });
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].guardType).toBe("send_email");
  });

  it("filters by decision", () => {
    const state = makeState({
      guardResults: [
        { decision: "BLOCK", reason: "r", risk_score: 0.8, audit_id: "a1", guard_type: "send_email" },
        { decision: "ALLOW", reason: "r", risk_score: 0.2, audit_id: "a2", guard_type: "code_merge" },
      ],
      audit: [
        { id: "e1", at: "2026-03-25T10:00:00Z", type: "FINAL_DECISION", details: { auditId: "a1" } },
        { id: "e2", at: "2026-03-25T11:00:00Z", type: "FINAL_DECISION", details: { auditId: "a2" } },
      ],
    });

    const summary = summarizeFromState(state, { decision: "BLOCK" });
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].decision).toBe("BLOCK");
  });

  it("filters by since timestamp", () => {
    const state = makeState({
      guardResults: [
        { decision: "BLOCK", reason: "r", risk_score: 0.8, audit_id: "a1", guard_type: "send_email" },
        { decision: "ALLOW", reason: "r", risk_score: 0.2, audit_id: "a2", guard_type: "code_merge" },
      ],
      audit: [
        { id: "e1", at: "2026-03-25T10:00:00Z", type: "FINAL_DECISION", details: { auditId: "a1" } },
        { id: "e2", at: "2026-03-25T14:00:00Z", type: "FINAL_DECISION", details: { auditId: "a2" } },
      ],
    });

    const summary = summarizeFromState(state, { since: "2026-03-25T12:00:00Z" });
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].auditId).toBe("a2");
  });

  it("respects limit", () => {
    const state = makeState({
      guardResults: [
        { decision: "ALLOW", reason: "r", risk_score: 0.1, audit_id: "a1" },
        { decision: "ALLOW", reason: "r", risk_score: 0.2, audit_id: "a2" },
        { decision: "ALLOW", reason: "r", risk_score: 0.3, audit_id: "a3" },
      ],
      audit: [
        { id: "e1", at: "2026-03-25T10:00:00Z", type: "FINAL_DECISION", details: { auditId: "a1" } },
        { id: "e2", at: "2026-03-25T11:00:00Z", type: "FINAL_DECISION", details: { auditId: "a2" } },
        { id: "e3", at: "2026-03-25T12:00:00Z", type: "FINAL_DECISION", details: { auditId: "a3" } },
      ],
    });

    const summary = summarizeFromState(state, { limit: 2 });
    expect(summary.rows).toHaveLength(2);
    // Most recent first
    expect(summary.rows[0].auditId).toBe("a3");
    expect(summary.rows[1].auditId).toBe("a2");
  });

  it("handles guard results without votes", () => {
    const state = makeState({
      guardResults: [
        { decision: "ALLOW", reason: "Scope check passed", risk_score: 0, audit_id: "a1" },
      ],
      audit: [
        { id: "e1", at: "2026-03-25T10:00:00Z", type: "FINAL_DECISION", details: { auditId: "a1" } },
      ],
    });

    const summary = summarizeFromState(state);
    expect(summary.rows[0].voteSummary).toEqual({ yes: 0, no: 0, rewrite: 0 });
    expect(summary.rows[0].evaluators).toEqual([]);
    expect(summary.rows[0].guardType).toBe("unknown");
  });

  it("handles guard results without matching audit events (no timestamp)", () => {
    const state = makeState({
      guardResults: [
        { decision: "BLOCK", reason: "r", risk_score: 0.9, audit_id: "orphan" },
      ],
      audit: [],
    });

    const summary = summarizeFromState(state);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].timestamp).toBe("");
  });
});

describe("formatSummaryTable", () => {
  it("returns message when no rows", () => {
    const result = formatSummaryTable({ rows: [], stats: { total: 0, byDecision: {}, avgRisk: 0 } });
    expect(result).toBe("No guard decisions found.");
  });

  it("formats a table with header, rows, and footer", () => {
    const summary = summarizeFromState(makeState({
      guardResults: [
        {
          decision: "BLOCK", reason: "r", risk_score: 0.85, audit_id: "a1", guard_type: "send_email",
          votes: [
            { evaluator: "security", vote: "NO", reason: "bad", risk: 0.9 },
            { evaluator: "compliance", vote: "YES", reason: "ok", risk: 0.2 },
          ],
        },
      ],
      audit: [
        { id: "e1", at: "2026-03-25T14:32:01Z", type: "FINAL_DECISION", details: { auditId: "a1" } },
      ],
    }));

    const table = formatSummaryTable(summary);
    expect(table).toContain("TIME");
    expect(table).toContain("DOMAIN");
    expect(table).toContain("DECISION");
    expect(table).toContain("2026-03-25 14:32:01");
    expect(table).toContain("send_email");
    expect(table).toContain("BLOCK");
    expect(table).toContain("0.85");
    expect(table).toContain("1/1/0");
    expect(table).toContain("security, compliance");
    expect(table).toContain("1 decisions");
    expect(table).toContain("1 BLOCK");
  });
});

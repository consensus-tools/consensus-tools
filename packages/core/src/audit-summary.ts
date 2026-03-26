import type { GuardResult, GuardVote, AuditEvent, StorageState } from "@consensus-tools/schemas";
import type { IStorage } from "@consensus-tools/storage";

/** A single row in the guard activity summary. */
export interface GuardActivityRow {
  auditId: string;
  timestamp: string;
  guardType: string;
  decision: string;
  riskScore: number;
  voteSummary: { yes: number; no: number; rewrite: number };
  evaluators: string[];
}

/** Aggregate stats across all rows. */
export interface GuardActivityStats {
  total: number;
  byDecision: Record<string, number>;
  avgRisk: number;
}

export interface GuardActivitySummary {
  rows: GuardActivityRow[];
  stats: GuardActivityStats;
}

export interface SummaryFilters {
  /** ISO timestamp — only include decisions after this time. */
  since?: string;
  /** Filter by guard domain (e.g., "send_email", "code_merge"). */
  domain?: string;
  /** Filter by decision (e.g., "BLOCK", "ALLOW"). */
  decision?: string;
  /** Maximum number of rows to return (default: 50). */
  limit?: number;
}

/**
 * Summarize guard activity from storage.
 *
 * Data flow:
 *   StorageState → correlate guardResults with audit events for timestamps
 *   → filter by time/domain/decision → sort by time descending → compute stats
 */
export async function summarizeGuardActivity(
  storage: IStorage,
  filters?: SummaryFilters,
): Promise<GuardActivitySummary> {
  const state = await storage.getState();
  return summarizeFromState(state, filters);
}

/** Pure function for testing — operates on state directly. */
export function summarizeFromState(
  state: StorageState,
  filters?: SummaryFilters,
): GuardActivitySummary {
  const limit = filters?.limit ?? 50;

  // Build a map of auditId → timestamp from FINAL_DECISION events
  const timestampMap = new Map<string, string>();
  for (const event of state.audit) {
    if (event.type === "FINAL_DECISION") {
      const auditId = (event.details as Record<string, unknown>)?.auditId as string | undefined;
      if (auditId) {
        timestampMap.set(auditId, event.at);
      }
    }
  }

  // Build rows from guardResults
  let rows: GuardActivityRow[] = state.guardResults.map((r) => {
    const votes = r.votes ?? [];
    return {
      auditId: r.audit_id,
      timestamp: timestampMap.get(r.audit_id) ?? "",
      guardType: r.guard_type ?? "unknown",
      decision: r.decision,
      riskScore: r.risk_score,
      voteSummary: tallyVotes(votes),
      evaluators: votes.map((v) => v.evaluator),
    };
  });

  // Apply filters
  if (filters?.since) {
    const since = filters.since;
    rows = rows.filter((r) => r.timestamp >= since);
  }
  if (filters?.domain) {
    const domain = filters.domain;
    rows = rows.filter((r) => r.guardType === domain);
  }
  if (filters?.decision) {
    const decision = filters.decision.toUpperCase();
    rows = rows.filter((r) => r.decision === decision);
  }

  // Sort by timestamp descending (most recent first)
  rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply limit
  rows = rows.slice(0, limit);

  // Compute stats
  const stats = computeStats(rows);

  return { rows, stats };
}

function tallyVotes(votes: GuardVote[]): { yes: number; no: number; rewrite: number } {
  let yes = 0, no = 0, rewrite = 0;
  for (const v of votes) {
    if (v.vote === "YES") yes++;
    else if (v.vote === "NO") no++;
    else if (v.vote === "REWRITE") rewrite++;
  }
  return { yes, no, rewrite };
}

function computeStats(rows: GuardActivityRow[]): GuardActivityStats {
  const total = rows.length;
  const byDecision: Record<string, number> = {};
  let riskSum = 0;

  for (const r of rows) {
    byDecision[r.decision] = (byDecision[r.decision] ?? 0) + 1;
    riskSum += r.riskScore;
  }

  return {
    total,
    byDecision,
    avgRisk: total > 0 ? riskSum / total : 0,
  };
}

/** Format a summary as a human-readable table for CLI output. */
export function formatSummaryTable(summary: GuardActivitySummary): string {
  const { rows, stats } = summary;

  if (rows.length === 0) {
    return "No guard decisions found.";
  }

  // Header
  const lines: string[] = [];
  lines.push(
    padRight("TIME", 22) +
    padRight("DOMAIN", 16) +
    padRight("DECISION", 16) +
    padRight("RISK", 8) +
    padRight("VOTES (Y/N/R)", 16) +
    "EVALUATORS",
  );
  lines.push("─".repeat(100));

  // Rows
  for (const r of rows) {
    const time = r.timestamp ? r.timestamp.replace("T", " ").slice(0, 19) : "(no timestamp)";
    const votes = `${r.voteSummary.yes}/${r.voteSummary.no}/${r.voteSummary.rewrite}`;
    const evaluators = r.evaluators.join(", ") || "(none)";
    lines.push(
      padRight(time, 22) +
      padRight(r.guardType, 16) +
      padRight(r.decision, 16) +
      padRight(r.riskScore.toFixed(2), 8) +
      padRight(votes, 16) +
      evaluators,
    );
  }

  // Footer
  lines.push("");
  const decisionSummary = Object.entries(stats.byDecision)
    .map(([k, v]) => `${v} ${k}`)
    .join(" | ");
  lines.push(
    `${stats.total} decisions | ${decisionSummary} | Avg risk: ${stats.avgRisk.toFixed(2)}`,
  );

  return lines.join("\n");
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str + " " : str + " ".repeat(len - str.length);
}

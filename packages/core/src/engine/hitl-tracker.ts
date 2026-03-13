import type { HitlApproval, HitlMode, GuardDecision } from "@consensus-tools/schemas";
import type { IStorage } from "../storage/interface.js";
import { newId } from "../util/ids.js";
import { nowIso } from "../util/time.js";

const WARNING_THRESHOLD = 0.75;
const CHECK_INTERVAL_MS = 15_000;

export interface NotificationDispatcher {
  sendApprovalPrompt(approval: HitlApproval): Promise<void>;
  sendWarning(approval: HitlApproval, remainingSec: number): Promise<void>;
  sendExpired(approval: HitlApproval, autoDecision: string): Promise<void>;
}

export interface HitlTrackerOptions {
  storage: IStorage;
  notifications?: NotificationDispatcher;
  onExpiry?: (approval: HitlApproval, decision: string) => Promise<void>;
  logger?: { warn?: (...args: unknown[]) => void };
}

/**
 * Tracks pending human-in-the-loop approvals with timeout and auto-decision.
 * Storage-backed via IStorage (state.hitlApprovals).
 */
export class HitlTracker {
  private readonly storage: IStorage;
  private readonly notifications?: NotificationDispatcher;
  private readonly onExpiry?: (approval: HitlApproval, decision: string) => Promise<void>;
  private readonly logger?: { warn?: (...args: unknown[]) => void };
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(opts: HitlTrackerOptions) {
    this.storage = opts.storage;
    this.notifications = opts.notifications;
    this.onExpiry = opts.onExpiry;
    this.logger = opts.logger;
  }

  async registerPendingApproval(opts: {
    runId: string;
    boardId: string;
    workflowId?: string;
    timeoutSec: number;
    requiredVotes?: number;
    mode?: HitlMode;
    autoDecisionOnExpiry?: string;
  }): Promise<HitlApproval> {
    const approval: HitlApproval = {
      id: newId("hitl"),
      runId: opts.runId,
      boardId: opts.boardId,
      workflowId: opts.workflowId,
      timeoutSec: opts.timeoutSec,
      requiredVotes: opts.requiredVotes ?? 1,
      receivedVotes: 0,
      mode: opts.mode ?? "approval",
      autoDecisionOnExpiry: opts.autoDecisionOnExpiry ?? "BLOCK",
      startedAt: nowIso(),
      warningSentAt: null,
      status: "pending",
    };

    await this.storage.update((state) => {
      state.hitlApprovals.push(approval);
    });

    if (this.notifications) {
      await this.notifications.sendApprovalPrompt(approval).catch((err) => {
        this.logger?.warn?.("[hitl] Failed to send approval prompt", err);
      });
    }

    this.ensureTimerRunning();
    return approval;
  }

  async recordVoteReceived(runId: string): Promise<{ complete: boolean; total: number; required: number }> {
    return (
      await this.storage.update((state) => {
        const entry = state.hitlApprovals.find((a) => a.runId === runId && a.status === "pending");
        if (!entry) return { complete: false, total: 0, required: 0 };
        entry.receivedVotes++;
        const complete = entry.receivedVotes >= entry.requiredVotes;
        if (complete) entry.status = "resolved";
        return { complete, total: entry.receivedVotes, required: entry.requiredVotes };
      })
    ).result;
  }

  async resolveApproval(runId: string): Promise<void> {
    await this.storage.update((state) => {
      const entry = state.hitlApprovals.find((a) => a.runId === runId && a.status === "pending");
      if (entry) entry.status = "resolved";
    });
  }

  async cancelApproval(runId: string): Promise<void> {
    await this.storage.update((state) => {
      const entry = state.hitlApprovals.find((a) => a.runId === runId && a.status === "pending");
      if (entry) entry.status = "expired";
    });
  }

  async getPendingApproval(runId: string): Promise<HitlApproval | undefined> {
    const state = await this.storage.getState();
    return state.hitlApprovals.find((a) => a.runId === runId && a.status === "pending");
  }

  async listPending(): Promise<HitlApproval[]> {
    const state = await this.storage.getState();
    return state.hitlApprovals.filter((a) => a.status === "pending");
  }

  private ensureTimerRunning() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.checkDeadlines().catch((err) => {
        this.logger?.warn?.("[hitl] Deadline check failed", err);
      });
    }, CHECK_INTERVAL_MS);
  }

  private async checkDeadlines(): Promise<void> {
    const now = Date.now();
    const pending = await this.listPending();

    for (const entry of pending) {
      const startedMs = new Date(entry.startedAt).getTime();
      const elapsedSec = (now - startedMs) / 1000;
      const remaining = entry.timeoutSec - elapsedSec;

      // Send warning at 75% threshold
      if (!entry.warningSentAt && elapsedSec >= entry.timeoutSec * WARNING_THRESHOLD) {
        const warned = (await this.storage.update((state) => {
          const a = state.hitlApprovals.find((x) => x.id === entry.id && x.status === "pending");
          if (!a) return false;
          a.warningSentAt = nowIso();
          state.audit.push({
            id: newId("audit"),
            at: nowIso(),
            type: "HITL_TIMEOUT_WARNING",
            details: {
              runId: entry.runId,
              elapsedSec: Math.round(elapsedSec),
              remainingSec: Math.round(remaining),
              timeoutSec: entry.timeoutSec,
              votesReceived: entry.receivedVotes,
              votesRequired: entry.requiredVotes,
            },
          });
          return true;
        })).result;

        if (warned && this.notifications) {
          await this.notifications.sendWarning(entry, Math.max(0, remaining)).catch((err) => {
            this.logger?.warn?.("[hitl] Failed to send warning", err);
          });
        }
      }

      // Deadline expired — auto-resolve
      if (elapsedSec >= entry.timeoutSec) {
        const decision = entry.autoDecisionOnExpiry;

        const expired = (await this.storage.update((state) => {
          const a = state.hitlApprovals.find((x) => x.id === entry.id && x.status === "pending");
          if (!a) return false;
          a.status = "expired";
          state.audit.push({
            id: newId("audit"),
            at: nowIso(),
            type: "HITL_DEADLINE_EXPIRED",
            details: {
              runId: entry.runId,
              timeoutSec: entry.timeoutSec,
              autoDecision: decision,
              votesReceived: entry.receivedVotes,
              votesRequired: entry.requiredVotes,
            },
          });
          return true;
        })).result;

        if (expired) {
          if (this.notifications) {
            await this.notifications.sendExpired(entry, decision).catch((err) => {
              this.logger?.warn?.("[hitl] Failed to send expiry notification", err);
            });
          }

          if (this.onExpiry) {
            await this.onExpiry(entry, decision).catch((err) => {
              this.logger?.warn?.("[hitl] onExpiry callback failed", err);
            });
          }
        }
      }
    }

    // Stop timer when nothing is pending
    const stillPending = await this.listPending();
    if (stillPending.length === 0 && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

import { updateReputation } from "@consensus-tools/personas";
import { buildLearningSummary, mutatePersona } from "@consensus-tools/personas";
import type { PersonaConfig, ReputationChange } from "@consensus-tools/personas";
import type { IStorage } from "@consensus-tools/storage";
import type { FeedbackSignal, LlmDecisionResult } from "./types.js";

// ── Reputation Manager ───────────────────────────────────────────────
// In-memory reputation tracking with optional persistence.
// Updates from human feedback signals (onFeedback), not self-consensus.
// Triggers persona respawn when reputation drops below threshold.

const MAX_DECISION_LOOKBACK = 100;
const MAX_FEEDBACK_LOOKBACK = 500;

export interface RespawnEvent {
  oldPersona: PersonaConfig;
  newPersona: PersonaConfig;
  reputation: number;
  reason: string;
}

export class ReputationManager {
  private scores: Map<string, number> = new Map();
  private decisions: Map<string, LlmDecisionResult> = new Map();
  private decisionHistory: LlmDecisionResult[] = [];
  private onRespawn?: (event: RespawnEvent) => void;

  constructor(
    private personas: PersonaConfig[],
    private threshold: number = 0.15,
    private store?: IStorage,
  ) {
    for (const p of personas) {
      this.scores.set(p.id, p.reputation ?? 0.55);
    }
  }

  /** Set callback for respawn events. */
  setRespawnHandler(handler: (event: RespawnEvent) => void): void {
    this.onRespawn = handler;
  }

  /** Get current reputation for a persona. */
  getReputation(personaId: string): number {
    return this.scores.get(personaId) ?? 0.55;
  }

  /** Get all current reputation scores. */
  getAllReputations(): Map<string, number> {
    return new Map(this.scores);
  }

  /** Record a decision for later feedback correlation. */
  recordDecision(result: LlmDecisionResult): void {
    this.decisions.set(result.decisionId, result);
    this.decisionHistory.push(result);

    // Cap both collections to prevent memory leaks
    if (this.decisionHistory.length >= MAX_DECISION_LOOKBACK) {
      this.decisionHistory.shift();
    }
    // Trim the feedback correlation map (keep most recent N entries)
    if (this.decisions.size > MAX_FEEDBACK_LOOKBACK) {
      const oldest = this.decisions.keys().next().value;
      if (oldest) this.decisions.delete(oldest);
    }
  }

  /** Process human feedback signal and update reputation. */
  processFeedback(signal: FeedbackSignal): ReputationChange[] {
    const decision = this.decisions.get(signal.decisionId);
    if (!decision) return [];

    // Map feedback to a "ground truth" final decision
    // override_block = human says the block was wrong, action should have been ALLOW
    // flag_miss = human says the allow was wrong, action should have been BLOCK
    const groundTruth = signal.type === "override_block" ? "ALLOW" : "BLOCK";

    const votes = decision.votes.map((v) => ({
      persona_id: v.personaId,
      vote: v.vote,
      confidence: v.confidence,
    }));

    const personaConfigs = this.personas.map((p) => ({
      ...p,
      reputation: this.scores.get(p.id) ?? 0.55,
    }));

    const result = updateReputation(votes, groundTruth, personaConfigs);

    // Apply changes
    for (const change of result.changes) {
      this.scores.set(change.persona_id, change.reputation_after);
    }

    // Check for respawn (collect respawns, then apply)
    this.checkRespawn();

    // Persist if store configured
    this.persist();

    return result.changes;
  }

  /** Check if any persona needs respawn. Collects replacements first to avoid mutation during iteration. */
  private checkRespawn(): void {
    const replacements: Array<{ index: number; old: PersonaConfig; rep: number }> = [];

    // Collect personas that need respawn (don't mutate during scan)
    for (let i = 0; i < this.personas.length; i++) {
      const persona = this.personas[i]!;
      const rep = this.scores.get(persona.id) ?? 0.55;
      if (rep < this.threshold) {
        replacements.push({ index: i, old: persona, rep });
      }
    }

    // Apply replacements after scan
    for (const { index, old, rep } of replacements) {
      const decisionRecords = this.decisionHistory.map((d) => ({
        final_decision: d.action === "allow" ? "ALLOW" : "BLOCK",
        votes: d.votes.map((v) => ({
          persona_id: v.personaId,
          vote: v.vote,
          confidence: v.confidence,
        })),
      }));

      const learning = buildLearningSummary(old.id, decisionRecords);
      const successor = mutatePersona(old, learning);

      this.personas[index] = successor;
      this.scores.delete(old.id);
      this.scores.set(successor.id, successor.reputation ?? 0.55);

      this.onRespawn?.({
        oldPersona: old,
        newPersona: successor,
        reputation: rep,
        reason: `Reputation ${rep.toFixed(3)} below threshold ${this.threshold}`,
      });
    }
  }

  /** Get current persona list (may include respawned successors). */
  getPersonas(): PersonaConfig[] {
    return [...this.personas];
  }

  /** Persist reputation scores to store (if configured). */
  private persist(): void {
    if (!this.store) return;
    const data: Record<string, number> = {};
    for (const [id, score] of this.scores) {
      data[id] = score;
    }
    this.store.update((state) => {
      (state as any).reputation = data;
    }).catch((err) => {
      // Log persistence failures instead of silently swallowing
      console.warn("[consensus] Reputation persistence failed:", err); // eslint-disable-line no-console
    });
  }

  /** Load reputation scores from store (if configured). */
  async load(): Promise<void> {
    if (!this.store) return;
    try {
      const state = await this.store.getState();
      const saved = (state as any)?.reputation as Record<string, number> | undefined;
      if (saved) {
        for (const [id, score] of Object.entries(saved)) {
          if (this.scores.has(id)) {
            this.scores.set(id, score);
          }
        }
      }
    } catch {
      // Load failure is non-fatal, start with defaults
    }
  }
}

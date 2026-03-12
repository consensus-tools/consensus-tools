import type {
  GuardEvaluateInput,
  GuardPolicy,
  GuardVote,
  WeightedGuardVote,
  WeightingMode,
} from "@consensus-tools/schemas";
import type { IStorage, GuardEngineOptions } from "@consensus-tools/core";
import {
  GuardEngine,
  HitlTracker,
  type NotificationDispatcher,
  newId,
  nowIso,
} from "@consensus-tools/core";
import { computeDecision, normalizeGuardType } from "@consensus-tools/guards";
import { evaluateWithAiSdk, generatePersonas, type AgentPersona } from "@consensus-tools/evals";

// ── Types ────────────────────────────────────────────────────────────

export interface NodeExecutorDeps {
  storage: IStorage;
  guardEngine?: GuardEngine;
  hitlTracker?: HitlTracker;
  notifications?: NotificationDispatcher;
  credentials?: CredentialProvider;
}

/** Minimal credential lookup — matches @consensus-tools/notifications CredentialProvider */
export interface CredentialProvider {
  get(provider: string, keyName: string): string | null;
}

export interface WorkflowNode {
  id: string;
  type: "trigger" | "agent" | "group" | "guard" | "hitl" | "action";
  label?: string;
  config?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  boardId?: string;
  nodes: WorkflowNode[];
}

export interface NodeExecIds {
  boardId: string;
  runId: string;
  workflowId: string;
}

export interface NodeOutput {
  [key: string]: unknown;
  pause?: boolean;
}

// ── Reviewer archetypes (fallback personas for agent nodes) ──────────

const REVIEWER_ARCHETYPES = [
  "security-reviewer",
  "performance-analyst",
  "code-quality-reviewer",
  "architecture-reviewer",
  "reliability-engineer",
  "api-design-reviewer",
  "data-integrity-analyst",
  "scalability-reviewer",
  "compliance-auditor",
  "ux-impact-reviewer",
];

// ── Node Executor ────────────────────────────────────────────────────

export class NodeExecutor {
  private readonly deps: NodeExecutorDeps;

  constructor(deps: NodeExecutorDeps) {
    this.deps = deps;
  }

  /**
   * Execute a single workflow node. Returns the node's output which is
   * stored in cursor as a checkpoint for downstream nodes.
   */
  async execute(
    node: WorkflowNode,
    context: Record<string, unknown>,
    ids: NodeExecIds,
    meta?: { linkedGuardId?: string },
  ): Promise<NodeOutput> {
    switch (node.type) {
      case "trigger":
        return this.executeTrigger(node, context);
      case "agent":
        return this.executeAgent(node, context, ids, meta);
      case "group":
        return this.executeGroup(node, context, ids);
      case "guard":
        return this.executeGuard(node, context, ids);
      case "hitl":
        return this.executeHitl(node, context, ids);
      case "action":
        return this.executeAction(node, context, ids);
      default:
        return { ok: true };
    }
  }

  // ── Trigger Node ─────────────────────────────────────────────────

  private async executeTrigger(
    node: WorkflowNode,
    context: Record<string, unknown>,
  ): Promise<NodeOutput> {
    const source = String(node.config?.source || node.config?.mode || "manual");

    // If a webhook handler pre-resolved payload, use it directly
    if ((context.__triggerPayload as Record<string, unknown>)?.ok) {
      const tp = context.__triggerPayload as Record<string, unknown>;

      // For GitHub triggers, try to enrich with PR diff
      if (source.startsWith("github.") && tp.pr && tp.repo) {
        try {
          const { fetchPullRequest } = await import("@consensus-tools/integrations");
          const pr = fetchPullRequest(String(tp.repo), Number((tp.pr as Record<string, unknown>).number));
          return { ...tp, diff: pr.diff, files: pr.files };
        } catch {
          // gh CLI not available — return payload as-is
        }
      }

      return tp as NodeOutput;
    }

    // GitHub trigger: try to fetch PR data
    if (source.startsWith("github.")) {
      const repo = String(node.config?.repo || "");
      const branch = String(node.config?.branch || "main");
      const base = { ok: true, trigger: source, provider: "github", repo, branch };

      if (repo) {
        try {
          const { listOpenPullRequests, fetchPullRequest } = await import("@consensus-tools/integrations");
          const prs = listOpenPullRequests(repo, 1);
          if (prs.length > 0) {
            const pr = fetchPullRequest(repo, prs[0]!.number);
            return { ...base, pr, diff: pr.diff, files: pr.files };
          }
        } catch {
          // gh CLI not available
        }
      }

      return { ...base, warning: !repo ? "repo is not configured" : "no open PRs found" };
    }

    // Linear trigger
    if (source.startsWith("linear.")) {
      const team = String(node.config?.team || "");
      return {
        ok: true,
        trigger: source,
        provider: "linear",
        team,
        project: String(node.config?.project || ""),
        warning: !team ? "team is not configured" : undefined,
      };
    }

    // Chat / cron / manual triggers
    if (source.startsWith("chat.")) {
      return {
        ok: true,
        trigger: source,
        channel: String(node.config?.channel || "slack"),
        chatType: String(node.config?.chatType || "group"),
      };
    }

    if (source.startsWith("cron.")) {
      return await this.executeCronTrigger(source, node);
    }

    return { ok: true, trigger: source };
  }

  private async executeCronTrigger(
    cronEvent: string,
    node: WorkflowNode,
  ): Promise<NodeOutput> {
    // Linear cron events
    if (cronEvent.startsWith("cron.linear.")) {
      const apiKey = this.deps.credentials?.get("linear", "api_key");
      if (!apiKey) {
        return { ok: false, trigger: "cron", event: cronEvent, error: "Linear API key not configured" };
      }

      const teamId = String(node.config?.team || "");
      if (!teamId) {
        return { ok: false, trigger: "cron", event: cronEvent, error: "Linear team ID not configured" };
      }

      try {
        const { createLinearClient } = await import("@consensus-tools/integrations");
        const client = await createLinearClient(apiKey);

        if (cronEvent === "cron.linear.unassigned_subtasks") {
          const [tasks, members] = await Promise.all([
            client.getUnassignedTasks(teamId),
            client.getTeamMembers(teamId),
          ]);
          return { ok: true, trigger: "cron", provider: "linear", event: cronEvent, team: teamId, subtasks: tasks, members, fetchedAt: nowIso() };
        }
      } catch (e: unknown) {
        return { ok: false, trigger: "cron", event: cronEvent, error: e instanceof Error ? e.message : "unknown" };
      }
    }

    // GitHub cron events
    if (cronEvent.startsWith("cron.github.")) {
      const repo = String(node.config?.repo || "");
      if (!repo) {
        return { ok: false, trigger: "cron", event: cronEvent, error: "Repository not configured" };
      }

      try {
        const { listOpenPullRequests } = await import("@consensus-tools/integrations");
        const prs = listOpenPullRequests(repo);
        return { ok: true, trigger: "cron", provider: "github", event: cronEvent, repo, prs, fetchedAt: nowIso() };
      } catch (e: unknown) {
        return { ok: false, trigger: "cron", event: cronEvent, error: e instanceof Error ? e.message : "unknown" };
      }
    }

    return { ok: true, trigger: "cron", event: cronEvent };
  }

  // ── Agent Node ───────────────────────────────────────────────────
  // Delegates to @consensus-tools/evals evaluateWithAiSdk()

  private async executeAgent(
    node: WorkflowNode,
    context: Record<string, unknown>,
    ids: NodeExecIds,
    meta?: { linkedGuardId?: string },
  ): Promise<NodeOutput> {
    const agentCount = Math.max(1, Math.min(10, Number(node.config?.agentCount ?? 3)));
    const model = String(node.config?.model || "gpt-4o-mini");

    // Resolve personas — use built-in personas from @consensus-tools/evals
    const personas = this.resolvePersonas(agentCount, node);

    // Build GuardEvaluateInput for the evaluator
    const evalInput: GuardEvaluateInput = {
      boardId: ids.boardId,
      agentId: `workflow:${ids.workflowId}`,
      action: {
        type: String(node.config?.guardType || "agent_action"),
        payload: {
          input: context,
          prompt: node.config?.prompt || "",
          nodeConfig: node.config || {},
        },
      },
    };

    // Run LLM-based multi-persona evaluation
    const votes = await evaluateWithAiSdk(evalInput, personas, {
      model,
      apiKey: this.deps.credentials?.get("openai", "api_key") ?? undefined,
    });

    // Compute weighted risk
    let totalWeight = 0;
    let weightedRisk = 0;
    for (let i = 0; i < votes.length; i++) {
      const rep = personas[i]?.reputation ?? 100;
      totalWeight += rep;
      weightedRisk += votes[i]!.risk * rep;
    }
    const aggregatedRisk = totalWeight > 0
      ? weightedRisk / totalWeight
      : votes.length > 0 ? votes.reduce((s, v) => s + v.risk, 0) / votes.length : 0.5;

    // Emit per-evaluator AGENT_VERDICT events + persist participants and votes
    await this.deps.storage.update((state) => {
      for (let vi = 0; vi < votes.length; vi++) {
        const v = votes[vi]!;
        const w = personas[vi]?.weight ?? 1;
        const r = personas[vi]?.reputation ?? 100;
        const now = nowIso();

        // Upsert participant (reuse across runs for same board+agent)
        let existing = state.participants.find(
          (p) => p.boardId === ids.boardId && p.subjectId === v.evaluator
        );
        if (existing) {
          existing.weight = w;
          existing.reputation = r;
        } else {
          existing = {
            id: newId("part"),
            boardId: ids.boardId,
            subjectType: "agent" as const,
            subjectId: v.evaluator,
            role: "voter",
            weight: w,
            reputation: r,
            status: "active" as const,
            metadata: {},
            createdAt: now,
          };
          state.participants.push(existing);
        }

        // Create consensus vote
        state.consensusVotes.push({
          id: newId("cvote"),
          boardId: ids.boardId,
          runId: ids.runId,
          participantId: existing.id,
          decision: v.vote as "YES" | "NO" | "REWRITE",
          confidence: Math.round((1 - (v.risk ?? 0.3)) * 100) / 100,
          rationale: v.reason || "",
          idempotencyKey: `${ids.runId}:${v.evaluator}`,
          createdAt: now,
        });

        // Audit event
        state.audit.push({
          id: newId("audit"),
          at: now,
          type: "AGENT_VERDICT",
          details: {
            runId: ids.runId,
            boardId: ids.boardId,
            evaluator: v.evaluator,
            verdict: v.vote,
            risk: v.risk,
            reason: v.reason,
            weight: w,
            reputation: r,
            guardType: "agent_action",
            ...(meta?.linkedGuardId ? { linkedGuardId: meta.linkedGuardId } : {}),
          },
        });
      }
    });

    return {
      votes,
      aggregatedRisk,
      agentCount,
      personas: personas.map((p) => ({ name: p.name, reputation: p.reputation })),
    };
  }

  private resolvePersonas(
    count: number,
    node: WorkflowNode,
  ): (AgentPersona & { weight: number; reputation: number })[] {
    const personaMode = String(node.config?.personaMode || "auto");
    const builtIn = generatePersonas(count);

    if (personaMode === "manual" && node.config?.personaNames) {
      const names = String(node.config.personaNames).split(",").map((n) => n.trim()).filter(Boolean);
      return Array.from({ length: count }, (_, i) => {
        const name = names[i % names.length]!;
        return {
          id: name,
          name,
          role: "reviewer",
          systemPrompt: String(node.config?.systemPrompt || `You are ${name}, a specialized reviewer.`),
          evaluationFocus: "general review",
          weight: 1,
          reputation: 100,
        };
      });
    }

    // Auto mode: use built-in personas, extend with archetypes if needed
    return Array.from({ length: count }, (_, i) => {
      if (i < builtIn.length) {
        return { ...builtIn[i]!, weight: 1, reputation: 100 };
      }
      const archetype = REVIEWER_ARCHETYPES[i % REVIEWER_ARCHETYPES.length]!;
      return {
        id: archetype,
        name: archetype,
        role: "reviewer",
        systemPrompt: `You are a ${archetype.replace(/-/g, " ")}.`,
        evaluationFocus: "specialized review",
        weight: 1,
        reputation: 100,
      };
    });
  }

  // ── Group Node ───────────────────────────────────────────────────
  // Runs child nodes in parallel, passes linkedGuardId for guard association

  private async executeGroup(
    node: WorkflowNode,
    context: Record<string, unknown>,
    ids: NodeExecIds,
  ): Promise<NodeOutput> {
    const children = Array.isArray(node.config?.children) ? (node.config.children as WorkflowNode[]) : [];
    if (!children.length) return { ok: true, group: true, children: [] };

    const linkedGuardId = node.config?.linkedGuardId as string | undefined;

    const childResults = await Promise.all(
      children.map((child) =>
        this.execute(child, context, ids, linkedGuardId ? { linkedGuardId } : undefined),
      ),
    );

    const merged: Record<string, unknown> = {};
    let hasPause = false;
    let pauseDetails: unknown = null;

    for (let i = 0; i < children.length; i++) {
      merged[children[i]!.id] = childResults[i];
      // Also inject into context for downstream nodes
      context[children[i]!.id] = childResults[i];
      if (childResults[i]?.pause === true) {
        hasPause = true;
        pauseDetails = { childId: children[i]!.id, childType: children[i]!.type, ...childResults[i] };
      }
    }

    if (hasPause) {
      return { pause: true, group: true, children: children.map((c) => c.id), results: merged, pauseDetails };
    }

    return { ok: true, group: true, children: children.map((c) => c.id), results: merged };
  }

  // ── Guard Node ───────────────────────────────────────────────────
  // Uses GuardEngine.evaluate() from @consensus-tools/core and
  // computeDecision() from @consensus-tools/guards for multi-agent consensus

  private async executeGuard(
    node: WorkflowNode,
    context: Record<string, unknown>,
    ids: NodeExecIds,
  ): Promise<NodeOutput> {
    const guardType = normalizeGuardType(String(node.config?.guardType || "agent_action"));
    const quorum = Number(node.config?.quorum ?? 0.7);
    const riskThreshold = Number(node.config?.riskThreshold ?? 0.7);
    const hitlThreshold = Number(node.config?.hitlThreshold ?? riskThreshold);

    // Check for agent verdicts from upstream agent/group nodes in the audit log
    const state = await this.deps.storage.getState();
    const allVerdicts = state.audit.filter(
      (e) => e.type === "AGENT_VERDICT" && (e.details as Record<string, unknown>)?.runId === ids.runId,
    );

    // Filter by linkedGuardId when present
    const hasLinkedIds = allVerdicts.some(
      (v) => (v.details as Record<string, unknown>)?.linkedGuardId,
    );
    const linkedVerdicts = hasLinkedIds
      ? allVerdicts.filter(
          (v) => (v.details as Record<string, unknown>)?.linkedGuardId === node.id,
        )
      : allVerdicts;

    // Respect numberOfReviewers cap
    const numberOfReviewers = Number(node.config?.numberOfReviewers ?? 0);
    const storedVerdicts = numberOfReviewers > 0 ? linkedVerdicts.slice(-numberOfReviewers) : linkedVerdicts;

    if (storedVerdicts.length > 0) {
      // Agents ran before guard — resolve their verdicts through consensus computation
      const policy: GuardPolicy = {
        policyId: String(node.config?.policyPack || guardType),
        version: "v1",
        quorum,
        riskThreshold,
        hitlRequiredAboveRisk: hitlThreshold,
        options: {},
      };

      // Look up policy assignment for weighting mode
      const policyAssignment = state.policyAssignments?.find(
        (p) => p.boardId === ids.boardId,
      );
      const weightingMode: WeightingMode = (policyAssignment?.weightingMode as WeightingMode) || "hybrid";

      // Convert stored verdicts to WeightedGuardVotes
      const weightedVotes: WeightedGuardVote[] = storedVerdicts.map((v) => {
        const d = v.details as Record<string, unknown>;
        return {
          evaluator: String(d.evaluator || "unknown"),
          vote: String(d.verdict || "YES").toUpperCase() as "YES" | "NO" | "REWRITE",
          risk: Number(d.risk ?? 0.5),
          reason: String(d.reason || ""),
          weight: Number(d.weight ?? 1),
          confidence: 1.0,
          reputation: Number(d.reputation ?? 100),
        };
      });

      // Use the 3-step weighted decision model from @consensus-tools/guards
      const result = computeDecision(weightedVotes, policy, weightingMode);

      // Post-resolution escalation: blockAboveRisk overrides REWRITE → BLOCK
      let finalDecision = result.decision;
      const reasons: string[] = [];
      const blockAboveRisk = Number(node.config?.blockAboveRisk ?? 1.0);
      if (finalDecision === "REWRITE" && result.combinedRisk > blockAboveRisk) {
        finalDecision = "BLOCK";
        reasons.push(`REWRITE escalated to BLOCK: risk ${result.combinedRisk.toFixed(3)} exceeds blockAboveRisk ${blockAboveRisk}`);
      }

      // Emit resolution scores to audit + persist guardResult, resolution, ledger
      const guardReason = `${guardType} consensus: ${result.tally.yes}/${result.tally.voterCount} YES votes`;
      const riskRounded = Math.round(result.combinedRisk * 1000) / 1000;
      const yesRatioRounded = Math.round(result.weightedYesRatio * 1000) / 1000;
      const now = nowIso();

      await this.deps.storage.update((s) => {
        // Audit events
        s.audit.push({
          id: newId("audit"),
          at: now,
          type: "RISK_SCORE",
          details: {
            runId: ids.runId,
            boardId: ids.boardId,
            risk_score: riskRounded,
            decision: finalDecision,
            guard_type: guardType,
            voter_count: result.tally.voterCount,
            yes_count: result.tally.yes,
            no_count: result.tally.no,
            rewrite_count: result.tally.rewrite,
            quorum_threshold: quorum,
            risk_threshold: riskThreshold,
            weighted_yes_ratio: yesRatioRounded,
          },
        });
        s.audit.push({
          id: newId("audit"),
          at: now,
          type: "CONSENSUS_QUORUM",
          details: {
            runId: ids.runId,
            boardId: ids.boardId,
            quorum_score: yesRatioRounded,
            quorum_met: result.quorumMet,
            total_voters: result.tally.voterCount,
            total_weight: Math.round(result.tally.totalWeight * 1000) / 1000,
            decision: finalDecision,
            guard_type: guardType,
            quorum_threshold: quorum,
            risk_threshold: riskThreshold,
          },
        });
        const finalDecisionAuditId = newId("audit");
        s.audit.push({
          id: finalDecisionAuditId,
          at: now,
          type: "FINAL_DECISION",
          details: {
            runId: ids.runId,
            boardId: ids.boardId,
            decision: finalDecision,
            reason: guardReason,
            risk_score: riskRounded,
            guard_type: guardType,
            consensus_meta: {
              quorumMet: result.quorumMet,
              weightedYesRatio: yesRatioRounded,
              voterCount: result.tally.voterCount,
            },
          },
        });

        // Persist guard result (mirrors GuardEngine.persistAuditEvents)
        s.guardResults.push({
          decision: finalDecision as "ALLOW" | "BLOCK" | "REWRITE" | "REQUIRE_HUMAN",
          reason: guardReason,
          risk_score: riskRounded,
          audit_id: finalDecisionAuditId,
          votes: weightedVotes.map((v) => ({
            evaluator: v.evaluator,
            vote: v.vote,
            reason: v.reason,
            risk: v.risk,
          })),
          guard_type: guardType as "send_email" | "code_merge" | "publish" | "support_reply" | "agent_action" | "deployment" | "permission_escalation",
          weighted_yes: yesRatioRounded,
        });

        // Persist resolution for workflow consensus
        s.resolutions.push({
          jobId: "",
          runId: ids.runId,
          boardId: ids.boardId,
          resolvedAt: now,
          winners: [],
          winningSubmissionIds: [],
          payouts: [],
          slashes: [],
          consensusTrace: {
            tally: result.tally,
            quorumMet: result.quorumMet,
            weightedYesRatio: result.weightedYesRatio,
            weightingMode,
          },
          finalArtifact: null,
          auditLog: [`workflow_guard:${ids.runId}`, `decision:${finalDecision}`],
        });

        // Persist ledger entry for workflow consensus fee
        s.ledger.push({
          id: newId("ledger"),
          at: now,
          type: "WORKFLOW_FEE",
          agentId: `workflow:${ids.workflowId}`,
          amount: Number(node.config?.consensusCost ?? 0),
          reason: `guard_consensus:${ids.runId}:${finalDecision}`,
        });
      });

      return {
        decision: finalDecision,
        risk: result.combinedRisk,
        reasons,
        consensus: {
          tally: result.tally,
          quorumMet: result.quorumMet,
          weightedYesRatio: result.weightedYesRatio,
          weightingMode,
        },
        boardResolution: true,
        hitlThreshold,
      };
    }

    // No agent verdicts — standalone guard using GuardEngine.evaluate()
    if (this.deps.guardEngine) {
      const evalInput: GuardEvaluateInput = {
        boardId: ids.boardId,
        agentId: `workflow:${ids.workflowId}`,
        action: {
          type: guardType,
          payload: { input: context, guardConfig: node.config || {} },
        },
      };
      const guardResult = await this.deps.guardEngine.evaluate(evalInput, {
        policyId: String(node.config?.policyPack || guardType),
        version: "v1",
        quorum,
        riskThreshold,
        hitlRequiredAboveRisk: hitlThreshold,
        options: {},
      });

      return {
        decision: guardResult.decision,
        risk: guardResult.risk_score,
        reasons: [guardResult.reason],
        boardResolution: false,
        hitlThreshold,
      };
    }

    // No guard engine configured — deterministic pass
    return {
      decision: "ALLOW",
      risk: 0.3,
      reasons: ["No guard engine configured — deterministic pass"],
      boardResolution: false,
      hitlThreshold,
    };
  }

  // ── HITL Node ────────────────────────────────────────────────────
  // Uses HitlTracker.registerPendingApproval() from @consensus-tools/core

  private async executeHitl(
    node: WorkflowNode,
    context: Record<string, unknown>,
    ids: NodeExecIds,
  ): Promise<NodeOutput> {
    // Find the guard output from upstream context
    const guardDecision = Object.values(context).find(
      (v): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && "decision" in v && "risk" in v,
    );

    const risk = Number(guardDecision?.risk ?? 0.5);
    const decision = String(guardDecision?.decision || "");
    const threshold = Number(node.config?.threshold ?? guardDecision?.hitlThreshold ?? 0.7);

    // Always trigger HITL for REWRITE or BLOCK decisions
    // Only skip if risk is below threshold AND decision is not REWRITE/BLOCK
    if (risk < threshold && decision !== "REWRITE" && decision !== "BLOCK") {
      return { pause: false, skipped: true, risk, threshold, decision };
    }

    const promptMode = String(node.config?.promptMode || node.config?.mode || "yes-no");
    const timeoutSec = Number(node.config?.timeoutSec ?? 900);
    const requiredVotes = Number(node.config?.requiredVotes ?? 1);
    const isVoteMode = promptMode === "vote";
    const autoDecisionOnExpiry = String(node.config?.autoDecisionOnExpiry || "BLOCK");

    // Register with HitlTracker for timeout management
    if (this.deps.hitlTracker) {
      await this.deps.hitlTracker.registerPendingApproval({
        runId: ids.runId,
        boardId: ids.boardId,
        workflowId: ids.workflowId,
        timeoutSec,
        requiredVotes: isVoteMode ? requiredVotes : 1,
        mode: isVoteMode ? "vote" : "approval",
        autoDecisionOnExpiry,
      });
    }

    // Send notification via chat adapters
    if (this.deps.notifications) {
      const approval = await this.deps.hitlTracker?.getPendingApproval(ids.runId);
      if (approval) {
        await this.deps.notifications.sendApprovalPrompt(approval).catch((err) => {
          console.error("[workflow] Failed to send approval notification:", err);
        });
      }
    }

    return { pause: true, risk, threshold, promptMode, timeoutSec, requiredVotes };
  }

  // ── Action Node ──────────────────────────────────────────────────
  // Delegates to @consensus-tools/integrations for GitHub/Linear actions

  private async executeAction(
    node: WorkflowNode,
    context: Record<string, unknown>,
    ids: NodeExecIds,
  ): Promise<NodeOutput> {
    const actionName = String(node.config?.action || "noop");

    // Check guard pass requirement
    if (node.config?.requireGuardPass) {
      const guardOutput = Object.values(context).find(
        (v): v is Record<string, unknown> =>
          typeof v === "object" && v !== null && "decision" in v && "risk" in v,
      );
      if (guardOutput?.decision === "BLOCK") {
        return { ok: false, action: actionName, skipped: true, reason: "Guard decision was BLOCK — action aborted" };
      }
    }

    // Check final human approval requirement
    if (node.config?.requireFinalHumanApprovalYes) {
      if (context.hitlDecision && context.hitlDecision !== "YES") {
        return { ok: false, action: actionName, skipped: true, reason: `Human decision was ${String(context.hitlDecision)} — action aborted` };
      }
    }

    if (actionName === "github.merge_pr") {
      return this.executeGitHubMerge(node, context, ids);
    }

    if (actionName === "linear.assign_subtasks") {
      return this.executeLinearAssign(node, context);
    }

    if (actionName === "linear.create_subtasks") {
      const triggerOutput = Object.values(context).find(
        (v): v is Record<string, unknown> => typeof v === "object" && v !== null && "trigger" in v,
      );
      const guardOutput = Object.values(context).find(
        (v): v is Record<string, unknown> =>
          typeof v === "object" && v !== null && "decision" in v && "risk" in v,
      );
      return {
        ok: true,
        action: actionName,
        parentTask: String((triggerOutput as Record<string, unknown>)?.task ?? (triggerOutput as Record<string, unknown>)?.project ?? "Unknown"),
        guardDecision: String(guardOutput?.decision || "UNKNOWN"),
        team: String((triggerOutput as Record<string, unknown>)?.team || ""),
        note: "Linear subtask creation will be executed via the Linear SDK when configured",
      };
    }

    return { ok: true, action: actionName, inputKeys: Object.keys(context) };
  }

  private async executeGitHubMerge(
    node: WorkflowNode,
    context: Record<string, unknown>,
    ids: NodeExecIds,
  ): Promise<NodeOutput> {
    const triggerOutput = Object.values(context).find(
      (v): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && "trigger" in v && "pr" in v,
    );

    if (!triggerOutput) {
      return { ok: false, action: "github.merge_pr", error: "No PR context available" };
    }

    const repo = String(triggerOutput.repo || "");
    const pr = triggerOutput.pr as Record<string, unknown>;
    const prNumber = Number(pr?.number);
    const mergeStrategy = String(node.config?.mergeStrategy || "merge");
    const mergeFlag = mergeStrategy === "squash" ? "--squash" : mergeStrategy === "rebase" ? "--rebase" : "--merge";

    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("gh", ["pr", "merge", String(prNumber), "--repo", repo, mergeFlag], {
        encoding: "utf8",
        timeout: 30_000,
      });
      return { ok: true, action: "github.merge_pr", merged: true, prNumber, repo };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (msg.includes("already merged")) {
        return { ok: true, action: "github.merge_pr", merged: false, alreadyMerged: true, prNumber, repo };
      }
      return { ok: false, action: "github.merge_pr", error: msg, prNumber, repo };
    }
  }

  private async executeLinearAssign(
    node: WorkflowNode,
    context: Record<string, unknown>,
  ): Promise<NodeOutput> {
    const triggerOutput = Object.values(context).find(
      (v): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && "subtasks" in v,
    );

    if (!(triggerOutput as Record<string, unknown>)?.subtasks) {
      return { ok: true, action: "linear.assign_subtasks", assigned: 0, note: "No unassigned subtasks found" };
    }

    const apiKey = this.deps.credentials?.get("linear", "api_key");
    if (!apiKey) {
      return { ok: false, action: "linear.assign_subtasks", error: "Linear API key not configured" };
    }

    const assignments = parseAssignmentPlan(context);
    if (!assignments.length) {
      return { ok: true, action: "linear.assign_subtasks", assigned: 0, note: "No assignment proposals found in agent verdicts" };
    }

    try {
      const { createLinearClient } = await import("@consensus-tools/integrations");
      const client = await createLinearClient(apiKey);
      const results = [];
      for (const a of assignments) {
        try {
          await client.assignTask(a.issueId, a.assigneeId);
          results.push({ issueId: a.issueId, assigneeId: a.assigneeId, ok: true });
        } catch (e: unknown) {
          results.push({ issueId: a.issueId, assigneeId: a.assigneeId, ok: false, error: e instanceof Error ? e.message : "unknown" });
        }
      }

      return {
        ok: true,
        action: "linear.assign_subtasks",
        assigned: results.filter((r) => r.ok).length,
        total: assignments.length,
        results,
      };
    } catch (e: unknown) {
      return { ok: false, action: "linear.assign_subtasks", error: e instanceof Error ? e.message : "unknown" };
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Parse assignment proposals from agent verdict reasons.
 * Agents return JSON arrays of { subtaskId, assigneeId } in their reason text.
 * Uses majority vote when multiple agents propose different assignees.
 */
function parseAssignmentPlan(context: Record<string, unknown>): { issueId: string; assigneeId: string }[] {
  const proposals: { subtaskId: string; assigneeId: string }[] = [];

  for (const value of Object.values(context)) {
    const val = value as Record<string, unknown> | undefined;
    const votes = (val?.votes || (val?.results
      ? Object.values(val.results as Record<string, unknown>).flatMap(
          (r) => (r as Record<string, unknown>)?.votes || [],
        )
      : [])) as Array<{ reason?: string }>;

    for (const vote of votes) {
      const reason = vote?.reason || "";
      const jsonMatch = reason.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const arr = JSON.parse(jsonMatch[0]) as Array<{ subtaskId?: string; assigneeId?: string }>;
          for (const item of arr) {
            if (item.subtaskId && item.assigneeId) {
              proposals.push({ subtaskId: item.subtaskId, assigneeId: item.assigneeId });
            }
          }
        } catch {
          // not valid JSON — skip
        }
      }
    }
  }

  // Majority vote per subtask
  const bySubtask = new Map<string, Map<string, number>>();
  for (const p of proposals) {
    if (!bySubtask.has(p.subtaskId)) bySubtask.set(p.subtaskId, new Map());
    const counts = bySubtask.get(p.subtaskId)!;
    counts.set(p.assigneeId, (counts.get(p.assigneeId) || 0) + 1);
  }

  const assignments: { issueId: string; assigneeId: string }[] = [];
  for (const [subtaskId, counts] of bySubtask) {
    let bestAssignee = "";
    let bestCount = 0;
    for (const [assigneeId, count] of counts) {
      if (count > bestCount) {
        bestAssignee = assigneeId;
        bestCount = count;
      }
    }
    if (bestAssignee) {
      assignments.push({ issueId: subtaskId, assigneeId: bestAssignee });
    }
  }

  return assignments;
}

// ── Workflow Validation ──────────────────────────────────────────────

const VALID_NODE_TYPES = new Set(["trigger", "agent", "group", "guard", "hitl", "action"]);
const VALID_TRIGGER_SOURCES = new Set([
  "manual", "github.pr", "github.push", "github.issue",
  "linear.issue", "linear.project",
  "chat.slack", "chat.teams", "chat.discord",
  "cron.linear.unassigned_subtasks", "cron.linear.stale_tasks", "cron.linear.overdue_tasks",
  "cron.github.stale_prs", "cron.github.failed_checks", "cron.github.unreviewed_prs", "cron.github.issue_triage",
]);

export function validateWorkflowDefinition(definition: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!definition || typeof definition !== "object") {
    return { valid: false, errors: ["Definition must be an object"] };
  }

  const def = definition as Record<string, unknown>;
  if (!Array.isArray(def.nodes)) {
    return { valid: false, errors: ["Definition must have a 'nodes' array"] };
  }

  const nodes = def.nodes as unknown[];
  if (nodes.length === 0) {
    return { valid: false, errors: ["Workflow must have at least one node"] };
  }

  const ids = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as Record<string, unknown>;
    if (!node || typeof node !== "object") {
      errors.push(`Node ${i}: must be an object`);
      continue;
    }
    if (!node.id || typeof node.id !== "string") {
      errors.push(`Node ${i}: missing 'id' string`);
    } else if (ids.has(node.id)) {
      errors.push(`Node ${i}: duplicate id '${node.id}'`);
    } else {
      ids.add(node.id);
    }

    if (!node.type || !VALID_NODE_TYPES.has(String(node.type))) {
      errors.push(`Node ${i}: invalid type '${String(node.type)}'. Valid: ${[...VALID_NODE_TYPES].join(", ")}`);
    }

    // Trigger nodes should have a valid source
    if (node.type === "trigger" && node.config) {
      const config = node.config as Record<string, unknown>;
      const source = String(config.source || config.mode || "manual");
      // Allow prefix matching (e.g., "github.pr_review" matches "github.")
      const isValid = VALID_TRIGGER_SOURCES.has(source) ||
        [...VALID_TRIGGER_SOURCES].some((v) => source.startsWith(v.split(".")[0] + "."));
      if (!isValid) {
        errors.push(`Node ${i}: unknown trigger source '${source}'`);
      }
    }

    // Group nodes must have children
    if (node.type === "group") {
      const config = node.config as Record<string, unknown> | undefined;
      if (!config?.children || !Array.isArray(config.children)) {
        errors.push(`Node ${i}: group node must have 'config.children' array`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

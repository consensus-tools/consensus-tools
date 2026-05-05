import { Client } from "langsmith";
import crypto from "node:crypto";

/**
 * LangSmith tracer for consensus-tools decisions.
 *
 * Sends structured traces of guard and wrapper decisions to LangSmith.
 * Works standalone (no LangChain required) via the langsmith SDK.
 *
 * Usage:
 *   const tracer = new LangSmithTracer({ projectName: "my-app" });
 *   // After a guard evaluation:
 *   await tracer.traceGuardDecision({ domain, decision, risk, votes, input, durationMs });
 *   // After a wrapper decision:
 *   await tracer.traceWrapperDecision({ name, action, aggregateScore, scores, attempt, durationMs });
 *
 * Requires LANGCHAIN_API_KEY env var to be set.
 */

export interface GuardTraceInput {
  domain: string;
  decision: string;
  risk: number;
  votes: Array<{ evaluator: string; vote: string; reason: string; risk: number }>;
  input: Record<string, unknown>;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface WrapperTraceInput {
  name: string;
  action: string;
  aggregateScore: number;
  scores: Array<{ score: number; rationale?: string; block?: boolean }>;
  attempt: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface LangSmithTracerOptions {
  /** LangSmith project name (default: "consensus-tools"). */
  projectName?: string;
  /** LangSmith API key (default: process.env.LANGCHAIN_API_KEY). */
  apiKey?: string;
}

export class LangSmithTracer {
  readonly projectName: string;
  private client: Client;

  constructor(opts?: LangSmithTracerOptions) {
    this.projectName = opts?.projectName ?? "consensus-tools";
    this.client = new Client({
      apiKey: opts?.apiKey,
    });
  }

  async traceGuardDecision(input: GuardTraceInput): Promise<string> {
    const runId = crypto.randomUUID();
    const startTime = Date.now() - input.durationMs;

    try {
      await this.client.createRun({
        id: runId,
        name: `guard.${input.domain}`,
        run_type: "chain",
        project_name: this.projectName,
        inputs: {
          domain: input.domain,
          payload: input.input,
        },
        outputs: {
          decision: input.decision,
          risk: input.risk,
          votes: input.votes,
        },
        start_time: startTime,
        end_time: Date.now(),
        extra: {
          metadata: {
            source: "consensus-tools",
            type: "guard_evaluation",
            domain: input.domain,
            decision: input.decision,
            risk: input.risk,
            vote_count: input.votes.length,
            ...input.metadata,
          },
        },
      });
    } catch (err) {
      // Tracing must never break the app, but failures should be observable.
      console.warn("consensus-tools: LangSmith traceGuardDecision failed", err);
    }

    return runId;
  }

  async traceWrapperDecision(input: WrapperTraceInput): Promise<string> {
    const runId = crypto.randomUUID();
    const startTime = Date.now() - input.durationMs;

    try {
      await this.client.createRun({
        id: runId,
        name: `wrapper.${input.name}`,
        run_type: "chain",
        project_name: this.projectName,
        inputs: {
          name: input.name,
          attempt: input.attempt,
        },
        outputs: {
          action: input.action,
          aggregateScore: input.aggregateScore,
          scores: input.scores,
        },
        start_time: startTime,
        end_time: Date.now(),
        extra: {
          metadata: {
            source: "consensus-tools",
            type: "wrapper_decision",
            action: input.action,
            score: input.aggregateScore,
            reviewer_count: input.scores.length,
            ...input.metadata,
          },
        },
      });
    } catch (err) {
      // Tracing must never break the app, but failures should be observable.
      console.warn("consensus-tools: LangSmith traceWrapperDecision failed", err);
    }

    return runId;
  }

  getTraceUrl(runId: string): string {
    return `https://smith.langchain.com/o/default/projects/p/${this.projectName}/r/${runId}`;
  }
}

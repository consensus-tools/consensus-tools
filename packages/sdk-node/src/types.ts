import type { ConsensusToolsConfig, Workflow, WorkflowRun, CronSchedule } from "@consensus-tools/schemas";
import type { JobEngine, LedgerEngine, AgentRegistry, GuardEngine, HitlTracker } from "@consensus-tools/core";
import type { IStorage } from "@consensus-tools/storage";
import type { CredentialManager } from "@consensus-tools/secrets";

/** Minimal interface so we don't need a hard dep on @consensus-tools/workflows at compile time. */
export interface WorkflowRunner {
  createWorkflow(name: string, definition: Record<string, unknown>, templateId?: string): Promise<Workflow>;
  listWorkflows(): Promise<Workflow[]>;
  run(workflowId: string, opts?: { context?: Record<string, unknown> }): Promise<WorkflowRun>;
  resume(workflowId: string, runId: string, decision: string, approver: string): Promise<WorkflowRun>;
}

export interface CronScheduler {
  register(workflowId: string, cronExpression: string): Promise<CronSchedule>;
  unregister(workflowId: string): Promise<boolean>;
  list(): Promise<CronSchedule[]>;
}

export interface ServerDeps {
  config: ConsensusToolsConfig;
  engine: JobEngine;
  ledger: LedgerEngine;
  storage: IStorage;
  agentRegistry?: AgentRegistry;
  guardEngine?: GuardEngine;
  hitlTracker?: HitlTracker;
  workflowRunner?: WorkflowRunner;
  cronScheduler?: CronScheduler;
  credentialManager?: CredentialManager;
  logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };
}

export interface WebhookHandlerContext {
  storage: IStorage;
  hitlTracker?: HitlTracker;
  workflowRunner?: WorkflowRunner;
  credentialManager?: CredentialManager;
  logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

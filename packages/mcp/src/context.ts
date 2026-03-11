import type { JobEngine, AgentRegistry, GuardEngine, HitlTracker, IStorage } from "@consensus-tools/core";
import type { WorkflowRunner, CronScheduler } from "@consensus-tools/workflows";

export interface McpContext {
  engine: JobEngine;
  agentRegistry: AgentRegistry;
  guardEngine: GuardEngine;
  hitlTracker: HitlTracker;
  storage: IStorage;
  agentId: string;
  workflowRunner?: WorkflowRunner;
  cronScheduler?: CronScheduler;
}

import type { ConsensusToolsConfig, Job } from "@consensus-tools/schemas";

export interface ServiceBackend {
  listJobs(filters?: Record<string, string | undefined>): Promise<Job[]>;
  getJob(jobId: string): Promise<Job | undefined>;
}

export function createService(
  config: ConsensusToolsConfig,
  backend: ServiceBackend,
  agentId: string,
  capabilities: string[],
  logger?: { debug?: (...args: unknown[]) => void },
) {
  return {
    id: "consensus-tools-service",
    start: async () => {
      if (config.mode === "global") return;
      logger?.debug?.(
        `consensus-tools: service started (agentId=${agentId}, capabilities=${Array.isArray(capabilities) ? capabilities.join(",") : ""})`,
      );
    },
    stop: async () => {
      if (config.mode === "global") return;
      logger?.debug?.("consensus-tools: service stopped");
    },
  };
}

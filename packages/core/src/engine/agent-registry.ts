import type { Agent, AgentConfig, GuardType } from "@consensus-tools/schemas";
import type { IStorage } from "../storage/interface.js";
import { newId } from "../util/ids.js";
import { nowIso } from "../util/time.js";

/**
 * Persistence-backed agent registry.
 * Agents are stored in StorageState.agents via IStorage.
 */
export class AgentRegistry {
  constructor(private readonly storage: IStorage) {}

  async createAgent(config: AgentConfig): Promise<Agent> {
    return (
      await this.storage.update((state) => {
        if (state.agents.some((a) => a.id === config.id)) {
          throw new Error(`Agent already exists: ${config.id}`);
        }

        if (config.kind === "external" && !config.apiKeyHash) {
          throw new Error("External agents require an apiKeyHash");
        }

        const agent: Agent = {
          id: config.id,
          name: config.name,
          kind: config.kind,
          scopes: config.scopes,
          apiKeyHash: config.apiKeyHash ?? null,
          status: "active",
          metadata: config.metadata ?? {},
          createdAt: nowIso(),
        };

        state.agents.push(agent);
        return agent;
      })
    ).result;
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    const state = await this.storage.getState();
    return state.agents.find((a) => a.id === id);
  }

  async listAgents(): Promise<Agent[]> {
    const state = await this.storage.getState();
    return state.agents;
  }

  async suspendAgent(id: string): Promise<Agent | undefined> {
    return (
      await this.storage.update((state) => {
        const agent = state.agents.find((a) => a.id === id);
        if (agent) agent.status = "suspended";
        return agent;
      })
    ).result;
  }

  async activateAgent(id: string): Promise<Agent | undefined> {
    return (
      await this.storage.update((state) => {
        const agent = state.agents.find((a) => a.id === id);
        if (agent) agent.status = "active";
        return agent;
      })
    ).result;
  }

  async removeAgent(id: string): Promise<boolean> {
    return (
      await this.storage.update((state) => {
        const idx = state.agents.findIndex((a) => a.id === id);
        if (idx === -1) return false;
        state.agents.splice(idx, 1);
        return true;
      })
    ).result;
  }

  async getAgentByApiKeyHash(apiKeyHash: string): Promise<Agent | undefined> {
    const state = await this.storage.getState();
    return state.agents.find((a) => a.apiKeyHash === apiKeyHash && a.status === "active");
  }

  async validateAgentScope(
    agentId: string,
    actionType: string,
  ): Promise<{ allowed: boolean; reason: string }> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      return { allowed: false, reason: `Agent not found: ${agentId}` };
    }

    if (agent.status === "suspended") {
      return { allowed: false, reason: `Agent is suspended: ${agentId}` };
    }

    if (agent.scopes.length === 0) {
      return { allowed: true, reason: "Agent has unrestricted scope" };
    }

    if (agent.scopes.includes(actionType)) {
      return { allowed: true, reason: `Action '${actionType}' is within agent scope` };
    }

    return {
      allowed: false,
      reason: `Action '${actionType}' is outside agent scope [${agent.scopes.join(", ")}]`,
    };
  }
}

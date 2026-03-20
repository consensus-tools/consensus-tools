import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";

/**
 * LangChain callback handler that records consensus-tools guard decisions.
 * Attach to an agent or chain to capture audit trail of all guard tool calls.
 */

interface DecisionLogEntry {
  tool: string;
  input: string;
  result?: string;
  timestamp: string;
}

export class ConsensusCallbackHandler extends BaseCallbackHandler {
  name = "consensus-tools";
  private log: DecisionLogEntry[] = [];

  async handleToolStart(
    tool: Serialized,
    input: string,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runName?: string,
  ): Promise<void> {
    const toolName = tool.name ?? (tool.id?.[tool.id.length - 1]) ?? "";
    if (toolName.startsWith("consensus_guard_")) {
      this.log.push({
        tool: toolName,
        input,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async handleToolEnd(
    output: string,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
  ): Promise<void> {
    // Attach result to the most recent log entry without a result
    for (let i = this.log.length - 1; i >= 0; i--) {
      if (this.log[i]!.result === undefined) {
        this.log[i]!.result = output;
        break;
      }
    }
  }

  getDecisionLog(): DecisionLogEntry[] {
    return [...this.log];
  }

  toJSONString(): string {
    return JSON.stringify(this.log, null, 2);
  }

  clear(): void {
    this.log = [];
  }
}

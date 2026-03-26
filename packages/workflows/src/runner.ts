import type { Workflow, WorkflowRun } from "@consensus-tools/schemas";
import type { IStorage } from "@consensus-tools/storage";
import { newId, nowIso } from "@consensus-tools/core";
import {
  NodeExecutor,
  validateWorkflowDefinition,
  type NodeExecutorDeps,
  type WorkflowDefinition,
  type WorkflowNode,
  type NodeExecIds,
} from "./node-executor.js";

export type WorkflowStepHandler = (
  stepId: string,
  context: WorkflowContext,
) => Promise<WorkflowStepResult>;

export interface WorkflowContext {
  workflowId: string;
  runId: string;
  definition: Record<string, unknown>;
  storage: IStorage;
  cursor: Record<string, unknown>;
}

export interface WorkflowStepResult {
  status: "completed" | "failed" | "waiting";
  output?: Record<string, unknown>;
  error?: string;
}

export type WorkflowTemplate = {
  id: string;
  name: string;
  definition: Record<string, unknown>;
  steps: string[];
  handler: WorkflowStepHandler;
};

/**
 * Workflow execution engine with checkpoint/cursor persistence.
 * Replaces the Vercel Workflow SDK durable steps with explicit cursor state in IStorage.
 */
export class WorkflowRunner {
  private readonly storage: IStorage;
  private readonly templates = new Map<string, WorkflowTemplate>();
  private readonly nodeExecutor?: NodeExecutor;

  constructor(storage: IStorage, nodeDeps?: NodeExecutorDeps) {
    this.storage = storage;
    if (nodeDeps) {
      this.nodeExecutor = new NodeExecutor(nodeDeps);
    }
  }

  registerTemplate(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
  }

  async createWorkflow(name: string, definition: Record<string, unknown>, templateId?: string): Promise<Workflow> {
    const now = nowIso();
    const workflow: Workflow = {
      id: newId("wf"),
      name,
      definition,
      templateId,
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.update((state) => {
      state.workflows.push(workflow);
    });

    return workflow;
  }

  async listWorkflows(): Promise<Workflow[]> {
    const state = await this.storage.getState();
    return state.workflows;
  }

  async run(workflowId: string, opts?: { context?: Record<string, unknown> }): Promise<WorkflowRun> {
    const state = await this.storage.getState();
    const workflow = state.workflows.find((w) => w.id === workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const runId = newId("wfrun");
    const now = nowIso();
    const initialCursor = opts?.context ? { ...opts.context } : {};
    const workflowRun: WorkflowRun = {
      id: runId,
      workflowId,
      runId,
      status: "running",
      cursor: initialCursor,
      createdAt: now,
    };

    await this.storage.update((s) => {
      s.workflowRuns.push(workflowRun);
      s.audit.push({
        id: newId("audit"),
        at: now,
        type: "WORKFLOW_STARTED",
        details: { workflowId, runId, name: workflow.name },
      });
    });

    // Execute via node-graph or template handler
    const definition = workflow.definition as Record<string, unknown>;
    if (Array.isArray(definition?.nodes) && this.nodeExecutor) {
      // Validate the definition first
      const validation = validateWorkflowDefinition(definition);
      if (!validation.valid) {
        const failedAt = nowIso();
        await this.storage.update((s) => {
          const r = s.workflowRuns.find((wr) => wr.id === runId);
          if (r) {
            r.status = "failed";
            r.completedAt = failedAt;
            r.result = "Validation failed";
          }
          s.audit.push({
            id: newId("audit"),
            at: failedAt,
            type: "WORKFLOW_FAILED",
            details: { workflowId, runId, errors: validation.errors },
          });
        });
        workflowRun.status = "failed";
        workflowRun.completedAt = failedAt;
        workflowRun.result = "Validation failed";
        return workflowRun;
      }

      await this.executeNodeGraph(workflow, workflowRun);
    } else {
      const template = workflow.templateId ? this.templates.get(workflow.templateId) : undefined;
      if (template) {
        await this.executeTemplate(template, workflow, workflowRun);
      }
    }

    // Return the final state
    const finalState = await this.storage.getState();
    return finalState.workflowRuns.find((r) => r.runId === runId) ?? workflowRun;
  }

  async resume(workflowId: string, runId: string, decision: string, approver: string): Promise<WorkflowRun> {
    const state = await this.storage.getState();
    const workflow = state.workflows.find((w) => w.id === workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
    const run = state.workflowRuns.find((r) => r.runId === runId && r.workflowId === workflowId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    // Inject decision into cursor so template handlers can read it
    await this.storage.update((s) => {
      const r = s.workflowRuns.find((wr) => wr.runId === runId);
      if (r && r.cursor) {
        (r.cursor as Record<string, unknown>)["hitl_resolved"] = true;
        (r.cursor as Record<string, unknown>)["hitlDecision"] = decision;
        (r.cursor as Record<string, unknown>)["approver"] = approver;
      }
      s.audit.push({
        id: newId("audit"),
        at: nowIso(),
        type: "WORKFLOW_RESUMED",
        details: { workflowId, runId, decision, approver },
      });
    });

    // Re-fetch with updated cursor
    const updatedState = await this.storage.getState();
    const updatedRun = updatedState.workflowRuns.find((r) => r.runId === runId)!;

    // Re-execute from where it paused — node-graph or template
    const definition = workflow.definition as Record<string, unknown>;
    if (Array.isArray(definition?.nodes) && this.nodeExecutor) {
      await this.executeNodeGraph(workflow, updatedRun);
    } else {
      const template = workflow.templateId ? this.templates.get(workflow.templateId) : undefined;
      if (template) {
        await this.executeTemplate(template, workflow, updatedRun);
      }
    }

    // Return the final state
    const finalState = await this.storage.getState();
    return finalState.workflowRuns.find((r) => r.runId === runId) ?? updatedRun;
  }

  /**
   * Execute a node-graph workflow. Iterates nodes sequentially, persisting
   * each node's output to cursor as a checkpoint. On `{ pause: true }`,
   * sets `__startIndex` and status = "waiting" for later resume.
   */
  private async executeNodeGraph(
    workflow: Workflow,
    run: WorkflowRun,
  ): Promise<void> {
    const definition = workflow.definition as unknown as WorkflowDefinition;
    const nodes = definition.nodes;
    const cursor = (run.cursor as Record<string, unknown>) || {};
    const startIndex = Number(cursor.__startIndex ?? 0);
    const boardId = String(definition.boardId || "workflow-system");

    const ids: NodeExecIds = {
      boardId,
      runId: run.runId,
      workflowId: workflow.id,
    };

    // Reconstruct context from previously completed nodes
    const context: Record<string, unknown> = {};
    for (let i = 0; i < startIndex; i++) {
      const node = nodes[i]!;
      if (cursor[node.id] !== undefined) {
        context[node.id] = cursor[node.id];
        // Expand group children into context
        const nodeOutput = cursor[node.id] as Record<string, unknown>;
        if (node.type === "group" && nodeOutput?.results && typeof nodeOutput.results === "object") {
          for (const [childId, childOutput] of Object.entries(nodeOutput.results as Record<string, unknown>)) {
            context[childId] = childOutput;
          }
        }
      }
    }

    // Overlay resume context (hitlDecision, approver) if present
    if (cursor.hitlDecision) context.hitlDecision = cursor.hitlDecision;
    if (cursor.approver) context.approver = cursor.approver;
    if (cursor.__triggerPayload) context.__triggerPayload = cursor.__triggerPayload;

    let finalStatus: "completed" | "failed" = "completed";

    for (let i = startIndex; i < nodes.length; i++) {
      const node = nodes[i]!;
      const startedAt = Date.now();

      await this.storage.update((state) => {
        state.audit.push({
          id: newId("audit"),
          at: nowIso(),
          type: "WORKFLOW_NODE_STARTED",
          details: { workflowId: workflow.id, runId: run.runId, node_index: i, node_id: node.id, node_type: node.type },
        });
      });

      try {
        const output = await this.nodeExecutor!.execute(node, context, ids);
        context[node.id] = output;

        // Persist node output as checkpoint
        await this.storage.update((state) => {
          const r = state.workflowRuns.find((wr) => wr.runId === run.runId);
          if (r && r.cursor) {
            (r.cursor as Record<string, unknown>)[node.id] = output;
          }
          state.audit.push({
            id: newId("audit"),
            at: nowIso(),
            type: "WORKFLOW_NODE_EXECUTED",
            details: {
              workflowId: workflow.id,
              runId: run.runId,
              node_index: i,
              node_id: node.id,
              node_type: node.type,
              duration_ms: Date.now() - startedAt,
              output: node.type === "guard"
                ? { decision: output.decision, risk: output.risk, hitlThreshold: output.hitlThreshold, boardResolution: output.boardResolution }
                : output,
            },
          });
        });

        // Handle pause (HITL or group with HITL child)
        if (output.pause === true) {
          await this.storage.update((state) => {
            const r = state.workflowRuns.find((wr) => wr.runId === run.runId);
            if (r) {
              r.status = "waiting";
              (r.cursor as Record<string, unknown>).__startIndex = i + 1;
            }
            state.audit.push({
              id: newId("audit"),
              at: nowIso(),
              type: "WORKFLOW_WAITING_HUMAN_APPROVAL",
              details: { workflowId: workflow.id, runId: run.runId, node_index: i, node_id: node.id },
            });
          });
          return; // Suspend — will resume via resume()
        }
      } catch (e: unknown) {
        finalStatus = "failed";
        const msg = e instanceof Error ? e.message : "unknown error";
        await this.storage.update((state) => {
          state.audit.push({
            id: newId("audit"),
            at: nowIso(),
            type: "WORKFLOW_NODE_FAILED",
            details: { workflowId: workflow.id, runId: run.runId, node_index: i, node_id: node.id, node_type: node.type, error: msg },
          });
        });
        // Store error as result
        context.__errorResult = msg;
        break;
      }
    }

    // Extract result from context: last guard decision or error message
    let resultSummary: string | undefined;
    if (finalStatus === "failed") {
      resultSummary = String(context.__errorResult || "Failed");
    } else {
      // Scan nodes in reverse to find last guard decision
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]!;
        const nodeCtx = context[node.id] as Record<string, unknown> | undefined;
        if (node.type === "guard" && nodeCtx?.decision) {
          resultSummary = String(nodeCtx.decision);
          break;
        }
        if (node.type === "action" && nodeCtx?.action) {
          resultSummary = String(nodeCtx.action);
          break;
        }
      }
    }

    const completedAt = nowIso();
    await this.storage.update((state) => {
      const r = state.workflowRuns.find((wr) => wr.runId === run.runId);
      if (r) {
        r.status = finalStatus;
        r.completedAt = completedAt;
        if (resultSummary) r.result = resultSummary;
      }
      state.audit.push({
        id: newId("audit"),
        at: completedAt,
        type: finalStatus === "completed" ? "WORKFLOW_COMPLETED" : "WORKFLOW_FAILED",
        details: { workflowId: workflow.id, runId: run.runId, result: resultSummary },
      });
    });
  }

  private async executeTemplate(
    template: WorkflowTemplate,
    workflow: Workflow,
    run: WorkflowRun,
  ): Promise<void> {
    const context: WorkflowContext = {
      workflowId: workflow.id,
      runId: run.id,
      definition: workflow.definition,
      storage: this.storage,
      cursor: (run.cursor as Record<string, unknown>) || {},
    };

    let finalStatus: "completed" | "failed" = "completed";

    for (const stepId of template.steps) {
      // Skip already-completed steps (checkpoint recovery)
      if (context.cursor[stepId] === "completed") continue;

      try {
        const result = await template.handler(stepId, context);

        await this.storage.update((state) => {
          const r = state.workflowRuns.find((wr) => wr.id === run.id);
          if (r && r.cursor) {
            (r.cursor as Record<string, unknown>)[stepId] = result.status;
          }
          state.audit.push({
            id: newId("audit"),
            at: nowIso(),
            type: "WORKFLOW_STEP",
            details: { workflowId: workflow.id, runId: run.id, stepId, status: result.status },
          });
        });

        context.cursor[stepId] = result.status;

        if (result.status === "failed") {
          finalStatus = "failed";
          break;
        }

        if (result.status === "waiting") {
          // Workflow is paused — will resume when triggered again
          return;
        }
      } catch (e: unknown) {
        finalStatus = "failed";
        const msg = e instanceof Error ? e.message : "unknown error";
        await this.storage.update((state) => {
          state.audit.push({
            id: newId("audit"),
            at: nowIso(),
            type: "WORKFLOW_STEP_ERROR",
            details: { workflowId: workflow.id, runId: run.id, stepId, error: msg },
          });
        });
        break;
      }
    }

    const completedAt = nowIso();
    await this.storage.update((state) => {
      const r = state.workflowRuns.find((wr) => wr.id === run.id);
      if (r) {
        r.status = finalStatus;
        r.completedAt = completedAt;
      }
      state.audit.push({
        id: newId("audit"),
        at: completedAt,
        type: finalStatus === "completed" ? "WORKFLOW_COMPLETED" : "WORKFLOW_FAILED",
        details: { workflowId: workflow.id, runId: run.id },
      });
    });
  }
}

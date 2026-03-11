import type { Workflow, WorkflowRun } from "@consensus-tools/schemas";
import type { IStorage } from "@consensus-tools/core";
import { newId, nowIso } from "@consensus-tools/core";

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

  constructor(storage: IStorage) {
    this.storage = storage;
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

  async run(workflowId: string): Promise<WorkflowRun> {
    const state = await this.storage.getState();
    const workflow = state.workflows.find((w) => w.id === workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const runId = newId("wfrun");
    const now = nowIso();
    const workflowRun: WorkflowRun = {
      id: runId,
      workflowId,
      runId,
      status: "running",
      cursor: {},
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

    // Execute via template handler if available
    const template = workflow.templateId ? this.templates.get(workflow.templateId) : undefined;
    if (template) {
      await this.executeTemplate(template, workflow, workflowRun);
    }

    return workflowRun;
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

    await this.storage.update((state) => {
      const r = state.workflowRuns.find((wr) => wr.id === run.id);
      if (r) r.status = finalStatus;
      state.audit.push({
        id: newId("audit"),
        at: nowIso(),
        type: finalStatus === "completed" ? "WORKFLOW_COMPLETED" : "WORKFLOW_FAILED",
        details: { workflowId: workflow.id, runId: run.id },
      });
    });
  }
}

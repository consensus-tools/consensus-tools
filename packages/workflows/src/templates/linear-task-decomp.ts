import type { WorkflowTemplate, WorkflowStepHandler } from "../runner.js";

const STEPS = ["fetch_tasks", "evaluate_agents", "hitl_approval", "create_subtasks"];

const handler: WorkflowStepHandler = async (stepId, context) => {
  switch (stepId) {
    case "fetch_tasks":
      return { status: "completed", output: { step: "fetch_tasks", teamId: context.definition["teamId"] } };

    case "evaluate_agents":
      return { status: "completed", output: { step: "evaluate_agents" } };

    case "hitl_approval":
      if (context.cursor["hitl_resolved"]) {
        return { status: "completed" };
      }
      return { status: "waiting", output: { waitingFor: "human_approval" } };

    case "create_subtasks":
      return { status: "completed", output: { step: "create_subtasks" } };

    default:
      return { status: "failed", error: `Unknown step: ${stepId}` };
  }
};

export const linearTaskDecompTemplate: WorkflowTemplate = {
  id: "linear_task_decomp",
  name: "Linear Task Decomposition",
  definition: {},
  steps: STEPS,
  handler,
};

import type { WorkflowTemplate, WorkflowStepHandler } from "../runner.js";

const STEPS = ["fetch_unassigned", "evaluate_agents", "guard_check", "auto_assign"];

const handler: WorkflowStepHandler = async (stepId, context) => {
  switch (stepId) {
    case "fetch_unassigned":
      return { status: "completed", output: { step: "fetch_unassigned", teamId: context.definition["teamId"] } };

    case "evaluate_agents":
      return { status: "completed", output: { step: "evaluate_agents" } };

    case "guard_check":
      return { status: "completed", output: { step: "guard_check" } };

    case "auto_assign":
      return { status: "completed", output: { step: "auto_assign" } };

    default:
      return { status: "failed", error: `Unknown step: ${stepId}` };
  }
};

export const cronAutoAssignTemplate: WorkflowTemplate = {
  id: "cron_auto_assign",
  name: "Cron Auto-Assign Tasks",
  definition: {},
  steps: STEPS,
  handler,
};

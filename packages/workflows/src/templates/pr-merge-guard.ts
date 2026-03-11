import type { WorkflowTemplate, WorkflowStepHandler } from "../runner.js";

const STEPS = ["fetch_pr", "evaluate_guard", "hitl_approval", "merge_action"];

const handler: WorkflowStepHandler = async (stepId, context) => {
  const def = context.definition;

  switch (stepId) {
    case "fetch_pr":
      // Fetch PR data — delegated to the integrations package at runtime
      return { status: "completed", output: { step: "fetch_pr", repo: def["repo"], prNumber: def["prNumber"] } };

    case "evaluate_guard":
      // Guard evaluation — delegated to GuardEngine at runtime
      return { status: "completed", output: { step: "evaluate_guard" } };

    case "hitl_approval":
      // HITL approval — the workflow pauses here until human approves
      if (context.cursor["hitl_resolved"]) {
        return { status: "completed" };
      }
      return { status: "waiting", output: { waitingFor: "human_approval" } };

    case "merge_action":
      // Merge the PR — delegated to integrations at runtime
      return { status: "completed", output: { step: "merge_action" } };

    default:
      return { status: "failed", error: `Unknown step: ${stepId}` };
  }
};

export const prMergeGuardTemplate: WorkflowTemplate = {
  id: "github_pr_merge_guard",
  name: "GitHub PR Merge Guard",
  definition: {},
  steps: STEPS,
  handler,
};

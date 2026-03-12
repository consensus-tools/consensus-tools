export const prompts = [
  {
    name: "post-job",
    description: "Create a new consensus job with the right parameters",
    arguments: [
      { name: "title", description: "What the job is about", required: true },
      { name: "mode", description: "SUBMISSION or VOTING", required: false },
    ],
  },
  {
    name: "review-submission",
    description: "Review and vote on a submission to a consensus job",
    arguments: [
      { name: "jobId", description: "The job to review submissions for", required: true },
    ],
  },
  {
    name: "guard-evaluate",
    description: "Evaluate an action through the guard engine before executing",
    arguments: [
      { name: "actionType", description: "Type of action (send_email, code_merge, deployment, etc.)", required: true },
    ],
  },
];

export function getPrompt(
  name: string,
  args: Record<string, string>,
): { messages: Array<{ role: string; content: { type: string; text: string } }> } {
  switch (name) {
    case "post-job":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create a consensus job titled "${args.title || "Untitled"}". Mode: ${args.mode || "SUBMISSION"}. Use the consensus_post_job tool with appropriate parameters including a description, reward amount, and expiration time.`,
            },
          },
        ],
      };

    case "review-submission":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Review submissions for job ${args.jobId || "<jobId>"}. First use consensus_status to see current submissions and their details, then use consensus_vote to vote on the best one with a score and rationale.`,
            },
          },
        ],
      };

    case "guard-evaluate":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Evaluate a "${args.actionType || "agent_action"}" action through the guard engine. Use the guard.evaluate tool or the specific guard.${args.actionType || "agent_action"} tool with the action details in the payload.`,
            },
          },
        ],
      };

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

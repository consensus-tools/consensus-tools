/**
 * Full node-graph workflow template definitions.
 * Ported from the legacy MCP server (@kaicianflone/consensus-local-mcp-board).
 * These are served via the /api/templates endpoints and displayed in the dashboard.
 */

export interface TemplateDefinition {
  id: string;
  name: string;
  definition: {
    boardId: string;
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      config: Record<string, unknown>;
    }>;
  };
}

const TEMPLATE_1_DEFINITION = {
  boardId: "workflow-system",
  nodes: [
    {
      id: "trigger-github-pr",
      type: "trigger",
      label: "GitHub PR Opened",
      config: { source: "github.pr.opened", repo: "", branch: "main" },
    },
    {
      id: "parallel-review",
      type: "group",
      label: "Parallel Review",
      config: {
        linkedGuardId: "guard-code-merge",
        children: [
          {
            id: "agent-1",
            type: "agent",
            label: "Security Reviewer",
            config: { agentCount: 1, personaMode: "manual", personaNames: "security-reviewer", model: "gpt-5.4" },
          },
          {
            id: "agent-2",
            type: "agent",
            label: "Performance Analyst",
            config: { agentCount: 1, personaMode: "manual", personaNames: "performance-analyst", model: "gpt-5.4" },
          },
          {
            id: "agent-3",
            type: "agent",
            label: "Code Quality",
            config: { agentCount: 1, personaMode: "manual", personaNames: "code-quality-reviewer", model: "gpt-5.4" },
          },
        ],
      },
    },
    {
      id: "guard-code-merge",
      type: "guard",
      label: "Code Merge Guard",
      config: {
        guardType: "code_merge",
        quorum: 0.6,
        riskThreshold: 0.7,
        hitlThreshold: 0.6,
        blockAboveRisk: 0.92,
        numberOfReviewers: 3,
        policyPack: "merge-default",
      },
    },
    {
      id: "human-approval-final-yes-no",
      type: "hitl",
      label: "Slack Final Execute Y/N",
      config: { channel: "slack", mode: "yes-no", threshold: 0.5 },
    },
    {
      id: "action-merge-pr",
      type: "action",
      label: "Merge PR",
      config: {
        action: "github.merge_pr",
        requireGuardPass: true,
        requireFinalHumanApprovalYes: true,
        idempotencyKeyFrom: "pr.sha",
      },
    },
  ],
};

const TEMPLATE_2_DEFINITION = {
  boardId: "workflow-system",
  nodes: [
    {
      id: "trigger-linear-task",
      type: "trigger",
      label: "Linear Task Submitted",
      config: { source: "linear.task.created", provider: "linear-mcp", project: "", team: "" },
    },
    {
      id: "parallel-decomp-review",
      type: "group",
      label: "Parallel Review",
      config: {
        linkedGuardId: "guard-task-decomp",
        children: [
          {
            id: "agent-decomp-1",
            type: "agent",
            label: "Task Decomposer",
            config: {
              agentCount: 1,
              personaMode: "manual",
              personaNames: "task-decomposer",
              model: "gpt-5.4",
              systemPrompt: "You are a task decomposition specialist. Given a parent task, break it into logical, non-overlapping subtasks that can each be assigned independently. Ensure subtasks are concrete, ordered, and cover all critical steps. Return your analysis as a structured vote.",
            },
          },
          {
            id: "agent-decomp-2",
            type: "agent",
            label: "Planning Reviewer",
            config: {
              agentCount: 1,
              personaMode: "manual",
              personaNames: "planning-reviewer",
              model: "gpt-5.4",
              systemPrompt: "You are a project planning reviewer. Evaluate proposed subtask decompositions for completeness, logical ordering, independence, and clarity. Flag any missing steps, overlaps, or vague items.",
            },
          },
          {
            id: "agent-decomp-3",
            type: "agent",
            label: "Scope Analyst",
            config: {
              agentCount: 1,
              personaMode: "manual",
              personaNames: "scope-analyst",
              model: "gpt-5.4",
              systemPrompt: "You are a scope analyst. Verify that each proposed subtask stays within the bounds of the parent task, does not introduce scope creep, and is sized appropriately for independent assignment.",
            },
          },
        ],
      },
    },
    {
      id: "guard-task-decomp",
      type: "guard",
      label: "Task Decomposition Guard",
      config: {
        guardType: "agent_action",
        quorum: 0.6,
        riskThreshold: 0.7,
        hitlThreshold: 0.6,
        blockAboveRisk: 0.92,
        numberOfReviewers: 3,
        policyPack: "task-decomposition",
        irreversibleDefault: false,
        evaluationRubric: JSON.stringify({
          evaluation_criteria: [
            "subtasks are logically ordered",
            "subtasks do not overlap",
            "each subtask can be assigned independently",
            "no critical steps missing",
            "subtasks are concrete and understandable",
          ],
        }),
        actionType: "task_decomposition",
      },
    },
    {
      id: "human-approval-decomp",
      type: "hitl",
      label: "Human Approval (optional)",
      config: { channel: "slack", mode: "yes-no", threshold: 0.7 },
    },
    {
      id: "action-create-plan",
      type: "action",
      label: "Create Linear Task Plan",
      config: { action: "linear.create_subtasks", requireGuardPass: true },
    },
  ],
};

const TEMPLATE_3_DEFINITION = {
  boardId: "workflow-system",
  nodes: [
    {
      id: "trigger-cron-linear",
      type: "trigger",
      label: "Cron: Fetch Unassigned Subtasks",
      config: { source: "cron.linear.unassigned_subtasks", cronExpression: "*/30 * * * *", team: "", project: "", memberIds: "" },
    },
    {
      id: "parallel-assignment-review",
      type: "group",
      label: "Parallel Assignment Review",
      config: {
        linkedGuardId: "guard-assignment",
        children: [
          {
            id: "agent-skill-matcher",
            type: "agent",
            label: "Skill Matcher",
            config: {
              agentCount: 1,
              personaMode: "manual",
              personaNames: "skill-matcher",
              model: "gpt-5.4",
              systemPrompt: "You are a skill-matching specialist. Given unassigned subtasks and team members with their recent task history, identify which member's recent work shows the most relevant domain expertise for each subtask. Return a JSON array of { subtaskId, assigneeId, assigneeName, reasoning } for each subtask.",
            },
          },
          {
            id: "agent-load-balancer",
            type: "agent",
            label: "Load Balancer",
            config: {
              agentCount: 1,
              personaMode: "manual",
              personaNames: "load-balancer",
              model: "gpt-5.4",
              systemPrompt: "You are a workload distribution analyst. Review the team members and their recent task counts. Propose assignments that distribute work evenly while respecting skill requirements. Flag any member who appears overloaded. Return a JSON array of { subtaskId, assigneeId, assigneeName, reasoning }.",
            },
          },
          {
            id: "agent-priority-analyst",
            type: "agent",
            label: "Priority Analyst",
            config: {
              agentCount: 1,
              personaMode: "manual",
              personaNames: "priority-analyst",
              model: "gpt-5.4",
              systemPrompt: "You are a task priority analyst. Ensure high-priority subtasks are assigned to the most capable and available members based on their recent work quality and availability. Return a JSON array of { subtaskId, assigneeId, assigneeName, reasoning }.",
            },
          },
        ],
      },
    },
    {
      id: "guard-assignment",
      type: "guard",
      label: "Assignment Guard",
      config: {
        guardType: "agent_action",
        quorum: 0.6,
        riskThreshold: 0.7,
        hitlThreshold: 0.6,
        blockAboveRisk: 0.92,
        numberOfReviewers: 3,
        policyPack: "task-assignment",
        irreversibleDefault: false,
        evaluationRubric: JSON.stringify({
          evaluation_criteria: [
            "assignments match member expertise based on recent work",
            "workload is distributed evenly across team members",
            "high-priority subtasks are assigned to available and capable members",
            "no member is assigned more tasks than they can handle",
            "all unassigned subtasks have a proposed assignee",
          ],
        }),
        actionType: "task_assignment",
      },
    },
    {
      id: "human-approval-assignment",
      type: "hitl",
      label: "Human Approval (optional)",
      config: { channel: "slack", mode: "yes-no", threshold: 0.7 },
    },
    {
      id: "action-assign-subtasks",
      type: "action",
      label: "Assign Linear Subtasks",
      config: { action: "linear.assign_subtasks", requireGuardPass: true },
    },
  ],
};

const WORKFLOW_TEMPLATES: Record<string, { name: string; definition: TemplateDefinition["definition"] }> = {
  "template-github-pr": { name: "Template 1 - GitHub PR Merge Guard", definition: TEMPLATE_1_DEFINITION },
  "template-linear-tasks": { name: "Template 2 - Linear Task Decomposition", definition: TEMPLATE_2_DEFINITION },
  "template-linear-assign": { name: "Template 3 - Cron: Auto-Assign Linear Subtasks", definition: TEMPLATE_3_DEFINITION },
};

export function listTemplates(): TemplateDefinition[] {
  return Object.entries(WORKFLOW_TEMPLATES).map(([id, tmpl]) => ({
    id,
    name: tmpl.name,
    definition: tmpl.definition,
  }));
}

export function getTemplateById(id: string): TemplateDefinition | null {
  const tmpl = WORKFLOW_TEMPLATES[id];
  if (!tmpl) return null;
  return { id, name: tmpl.name, definition: tmpl.definition };
}

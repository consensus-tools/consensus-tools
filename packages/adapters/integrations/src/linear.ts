/**
 * Linear SDK integration adapter.
 * Wraps the @linear/sdk client for task and team member operations.
 * Requires `@linear/sdk` as a peer dependency.
 */

export interface LinearTask {
  id: string;
  title: string;
  state: string;
  assigneeId: string | null;
  teamId: string;
}

export interface LinearTeamMember {
  id: string;
  name: string;
  email: string;
}

export interface LinearClient {
  getUnassignedTasks(teamId: string, limit?: number): Promise<LinearTask[]>;
  getTeamMembers(teamId: string): Promise<LinearTeamMember[]>;
  createSubtask(parentId: string, title: string, assigneeId?: string): Promise<{ id: string }>;
  assignTask(taskId: string, assigneeId: string): Promise<void>;
}

/**
 * Creates a LinearClient from an API key.
 * Requires @linear/sdk to be installed.
 */
export async function createLinearClient(apiKey: string): Promise<LinearClient> {
  // @ts-expect-error — @linear/sdk is an optional peer dependency
  const { LinearClient: SDK } = await import("@linear/sdk");
  const client = new (SDK as any)({ apiKey });

  return {
    async getUnassignedTasks(teamId, limit = 20) {
      const issues = await client.issues({
        filter: { team: { id: { eq: teamId } }, assignee: { null: true } },
        first: limit,
      });
      return issues.nodes.map((i: any) => ({
        id: i.id,
        title: i.title,
        state: i.state?.name ?? "unknown",
        assigneeId: i.assignee?.id ?? null,
        teamId,
      }));
    },

    async getTeamMembers(teamId) {
      const team = await client.team(teamId);
      const members = await team.members();
      return members.nodes.map((m: any) => ({
        id: m.id,
        name: m.name,
        email: m.email,
      }));
    },

    async createSubtask(parentId, title, assigneeId) {
      const parent = await client.issue(parentId);
      const created = await client.createIssue({
        title,
        teamId: parent.team?.id ?? "",
        parentId,
        assigneeId,
      });
      const issue = await created.issue;
      return { id: issue?.id ?? "" };
    },

    async assignTask(taskId, assigneeId) {
      await client.updateIssue(taskId, { assigneeId });
    },
  };
}

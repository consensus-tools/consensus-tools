const API = '/api';
const MCP_API = '/api/mcp';

async function j(r: Response) {
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// ── Boards & Runs ─────────────────────────────────────────
export async function getBoards() { return fetch(`${MCP_API}/boards`).then(j); }
export async function getBoard(id: string) { return fetch(`${MCP_API}/boards/${id}`).then(j); }
export async function getRun(id: string) { return fetch(`${MCP_API}/runs/${id}`).then(j); }
export async function createBoard(name: string) {
  // Boards are derived from jobs; creating a board posts a placeholder job
  return fetch(`${MCP_API}/boards`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }).then(j);
}

// ── Events & Audit ────────────────────────────────────────
export async function getEvents(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) q.set(k, String(v)); });
  return fetch(`${MCP_API}/events?${q.toString()}`).then(j);
}
export async function getRunIds(): Promise<{ runIds: string[] }> {
  // Derive run IDs from events
  return fetch(`${MCP_API}/events?limit=500`).then(j).then((events: any[]) => {
    const ids = new Set<string>();
    for (const e of events) {
      const rid = e.details?.runId;
      if (rid) ids.add(rid);
    }
    return { runIds: [...ids] };
  });
}
export async function clearEvents(params: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) q.set(k, v); });
  return fetch(`${MCP_API}/events?${q.toString()}`, { method: 'DELETE' }).then(j);
}

// ── Guard Evaluation ──────────────────────────────────────
export async function evalAction(input: any) {
  return fetch(`${API}/guard.evaluate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(j);
}

// ── Workflows ─────────────────────────────────────────────
export async function getWorkflows() { return fetch(`${API}/workflows`).then(j); }
export async function createWorkflow(name: string, definition: any) { return fetch(`${API}/workflows`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, definition }) }).then(j); }
export async function updateWorkflow(id: string, patch: any) { return fetch(`${API}/workflows/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then(j); }
export async function runWorkflow(id: string) { return fetch(`${API}/workflows/${id}/run`, { method: 'POST' }).then(j); }
export async function getWorkflow(id: string) { return fetch(`${API}/workflows/${id}`).then(j); }
export async function deleteWorkflow(id: string) { return fetch(`${API}/workflows/${id}`, { method: 'DELETE' }).then(j); }

export async function approveWorkflowRun(runId: string, decision: 'YES' | 'NO', approver = 'human') {
  return fetch(`${API}/workflow-runs/${encodeURIComponent(runId)}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, approver }) }).then(j);
}

// ── Templates ─────────────────────────────────────────────
export async function getTemplates() { return fetch(`${API}/templates`).then(j); }
export async function getTemplate(id: string) { return fetch(`${API}/templates/${id}`).then(j); }

// ── Agents & Participants ─────────────────────────────────
export async function connectAgent(input: { name: string; scopes?: string[]; boards?: string[]; workflows?: string[] }) {
  return fetch(`${API}/agents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: input.name, name: input.name, kind: 'external', scopes: input.scopes ?? [], boards: input.boards ?? [], workflows: input.workflows ?? [] }) }).then(j);
}
export async function listAgents() { return fetch(`${API}/agents`).then(j); }
export async function createParticipant(input: any) { return fetch(`${API}/participants`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(j); }
export async function listParticipants(boardId: string) { return fetch(`${API}/participants?boardId=${encodeURIComponent(boardId)}`).then(j); }
export async function updateParticipant(id: string, patch: any) { return fetch(`${API}/participants/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then(j); }
export async function deleteParticipant(id: string) { return fetch(`${API}/participants/${id}`, { method: 'DELETE' }).then(j); }
export async function assignPolicy(input: any) {
  return fetch(`${API}/policies/assign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(j);
}
export async function submitConsensusVote(input: any) {
  return fetch(`${API}/votes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(j);
}
export async function getVotes(runId: string) {
  return fetch(`${API}/votes/${encodeURIComponent(runId)}`).then(j);
}

// ── HITL ──────────────────────────────────────────────────
export async function getHitlPending() { return fetch(`${API}/hitl/pending`).then(j); }

// ── Cron ──────────────────────────────────────────────────
export async function getCronSchedules() { return fetch(`${API}/cron`).then(j); }

// ── Credentials ──────────────────────────────────────────────
export async function getCredentialsList() { return fetch(`${API}/settings/credentials`).then(j); }
export async function upsertCredential(provider: string, keyName: string, value: string) {
  return fetch(`${API}/settings/credentials`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, keyName, value }) }).then(j);
}
export async function deleteCredential(provider: string, keyName: string) {
  return fetch(`${API}/settings/credentials/${encodeURIComponent(provider)}/${encodeURIComponent(keyName)}`, { method: 'DELETE' }).then(j);
}
export async function getProviderStatus(provider: string) {
  return fetch(`${API}/settings/credentials/${encodeURIComponent(provider)}/status`).then(j);
}

// ── Adapters ─────────────────────────────────────────────
export async function getAdapters() { return fetch(`${API}/settings/adapters`).then(j); }
export async function installAdapter(adapter: string) {
  return fetch(`${API}/settings/adapters/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adapter }) }).then(j);
}
export async function uninstallAdapter(adapter: string) {
  return fetch(`${API}/settings/adapters/uninstall`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adapter }) }).then(j);
}

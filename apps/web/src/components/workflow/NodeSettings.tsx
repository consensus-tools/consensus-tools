import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Badge } from '../ui/badge';
import { Settings, Save, X, Plus, Trash2, Bot, Info, Mail, GitMerge, Globe, MessageSquare, Rocket, Lock, Cpu } from 'lucide-react';
import type { WorkflowNode } from './NodeCanvas';
import { NODE_ICON_COLORS, PALETTE, type NodeType } from './NodePalette';

const CHAT_CHANNELS = [
  { id: 'slack', label: 'Slack' },
  { id: 'discord', label: 'Discord' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'signal', label: 'Signal' },
  { id: 'googlechat', label: 'Google Chat' },
  { id: 'irc', label: 'IRC' },
  { id: 'imessage', label: 'iMessage' },
];

const TRIGGER_SOURCE_GROUPS: { label: string; items: { id: string; label: string }[] }[] = [
  { label: 'GitHub', items: [
    { id: 'github.pr.opened', label: 'PR Opened' },
    { id: 'github.pr.updated', label: 'PR Updated' },
    { id: 'github.pr.closed', label: 'PR Closed' },
    { id: 'github.pr.review_requested', label: 'PR Review Requested' },
    { id: 'github.commit', label: 'Push / Commit' },
    { id: 'github.issue.opened', label: 'Issue Opened' },
    { id: 'github.issue.closed', label: 'Issue Closed' },
    { id: 'github.comment.created', label: 'Comment Created' },
  ]},
  { label: 'Linear', items: [
    { id: 'linear.task.created', label: 'Task Created' },
    { id: 'linear.task.updated', label: 'Task Updated' },
    { id: 'linear.webhook', label: 'Webhook' },
  ]},
  { label: 'Cron: Linear', items: [
    { id: 'cron.linear.unassigned_subtasks', label: 'Unassigned Subtasks' },
    { id: 'cron.linear.stale_tasks', label: 'Stale Tasks' },
    { id: 'cron.linear.overdue_tasks', label: 'Overdue Tasks' },
  ]},
  { label: 'Cron: GitHub', items: [
    { id: 'cron.github.stale_prs', label: 'Stale PRs' },
    { id: 'cron.github.failed_checks', label: 'Failed CI Checks' },
    { id: 'cron.github.unreviewed_prs', label: 'Unreviewed PRs' },
    { id: 'cron.github.issue_triage', label: 'Issue Triage' },
  ]},
  { label: 'Chat', items: [
    { id: 'chat.message', label: 'Message' },
    { id: 'chat.mention', label: 'Mention' },
    { id: 'chat.command', label: 'Command' },
  ]},
  { label: 'Other', items: [
    { id: 'manual', label: 'Manual' },
    { id: 'webhook', label: 'Webhook' },
  ]},
];

const CRON_EVENT_HINTS: Record<string, string> = {
  'cron.linear.unassigned_subtasks': 'Fetches unassigned subtasks and team members from Linear on schedule. Requires a Linear API key in Settings → Linear.',
  'cron.linear.stale_tasks': 'Finds tasks not updated within the stale threshold. Excludes completed/cancelled. Requires a Linear API key in Settings → Linear.',
  'cron.linear.overdue_tasks': 'Finds tasks past their due date. Excludes completed/cancelled. Requires a Linear API key in Settings → Linear.',
  'cron.github.stale_prs': 'Finds open PRs with no activity beyond the stale threshold. Requires gh CLI to be authenticated.',
  'cron.github.failed_checks': 'Finds open PRs with failing CI checks beyond the hour threshold. Requires gh CLI to be authenticated.',
  'cron.github.unreviewed_prs': 'Finds open PRs awaiting review beyond the pending threshold. Requires gh CLI to be authenticated.',
  'cron.github.issue_triage': 'Finds open issues that are unlabeled and/or unassigned. Requires gh CLI to be authenticated.',
};

interface NodeSettingsProps {
  node: WorkflowNode | null;
  onUpdate: (id: string, config: Record<string, any>) => void;
  isGroupChild?: boolean;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">{children}</label>;
}

export function NodeSettings({ node, onUpdate, boardId, isGroupChild }: NodeSettingsProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [participants, setParticipants] = useState<any[]>([]);

  useEffect(() => {
    if (boardId) {
      import('../../lib/api').then(api => {
        api.listParticipants(boardId).then(d => {
          setParticipants(d.participants || []);
        });
      });
    }
  }, [boardId]);

  useEffect(() => {
    if (node) {
      setDraft({ ...node.config });
      setEditing(false);
    }
  }, [node?.id]);

  if (!node) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5" /> Node Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto scrollbar-custom">
          <p className="text-sm text-muted-foreground">Select a node to configure it.</p>
        </CardContent>
      </Card>
    );
  }

  function set(key: string, value: any) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (!editing) setEditing(true);
  }

  function handleSave() {
    onUpdate(node!.id, draft);
    setEditing(false);
  }

  function handleCancel() {
    setDraft({ ...node!.config });
    setEditing(false);
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5" /> Node Settings
          </CardTitle>
          <Badge variant="secondary">{node.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto scrollbar-custom">
        <div className="grid grid-cols-2 gap-4">
          {node.type === 'trigger' && (
            <>
              <FieldLabel>
                Source
                <Select value={draft.source || 'manual'} onChange={(e) => set('source', e.target.value)}>
                  {TRIGGER_SOURCE_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </FieldLabel>
              {(draft.source || '').startsWith('github.') && (
                <>
                  <div className="col-span-2">
                    <FieldLabel>
                      Run Mode
                      <Select value={draft.runMode || 'webhook'} onChange={(e) => set('runMode', e.target.value)}>
                        <option value="webhook">PR Webhook — real-time (recommended)</option>
                        <option value="manual">Manual Poll — on-demand via Run button</option>
                      </Select>
                    </FieldLabel>
                  </div>
                  <FieldLabel>Repository <Input value={draft.repo || ''} onChange={(e) => set('repo', e.target.value)} placeholder="owner/repo" /></FieldLabel>
                  <FieldLabel>Branch <Input value={draft.branch || 'main'} onChange={(e) => set('branch', e.target.value)} /></FieldLabel>
                  <div className="col-span-2 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400/90">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {(draft.runMode || 'webhook') === 'webhook' ? (
                      <span>Webhook mode — configure your GitHub repo to send <strong>Pull request</strong> events to this server. See <strong>Settings → GitHub</strong> for the webhook URL and secret.</span>
                    ) : (
                      <span>Manual poll mode — clicking Run fetches the most recent open PR on the configured branch via <code>gh pr list</code>. Requires <code>gh</code> to be authenticated.</span>
                    )}
                  </div>
                </>
              )}
              {(draft.source || '').startsWith('linear.') && (
                <>
                  <div className="col-span-2">
                    <FieldLabel>
                      Run Mode
                      <Select value={draft.runMode || 'webhook'} onChange={(e) => set('runMode', e.target.value)}>
                        <option value="webhook">Webhook — real-time (recommended)</option>
                        <option value="manual">Manual Poll — on-demand via Run button</option>
                      </Select>
                    </FieldLabel>
                  </div>
                  <FieldLabel>Team <Input value={draft.team || ''} onChange={(e) => set('team', e.target.value)} placeholder="ENG" /></FieldLabel>
                  <FieldLabel>Project <Input value={draft.project || ''} onChange={(e) => set('project', e.target.value)} placeholder="my-project" /></FieldLabel>
                  <div className="col-span-2 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400/90">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {(draft.runMode || 'webhook') === 'webhook' ? (
                      <span>Webhook mode — configure a Linear webhook to send <strong>Issue</strong> events to this server. See <strong>Settings → Linear</strong> for the webhook URL and API key.</span>
                    ) : (
                      <span>Manual poll mode — clicking Run fetches tasks from Linear via the API. Requires a Linear API key configured in Settings.</span>
                    )}
                  </div>
                </>
              )}
              {(draft.source || '').startsWith('cron.') && (
                <CronEventConfig source={draft.source} draft={draft} set={set} />
              )}
              {(draft.source || '').startsWith('chat.') && (
                <>
                  <FieldLabel>
                    Channel
                    <Select value={draft.channel || 'slack'} onChange={(e) => set('channel', e.target.value)}>
                      {CHAT_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </Select>
                  </FieldLabel>
                  <FieldLabel>
                    Chat Type
                    <Select value={draft.chatType || 'group'} onChange={(e) => set('chatType', e.target.value)}>
                      <option value="group">Group</option>
                      <option value="direct">Direct</option>
                      <option value="all">All</option>
                    </Select>
                  </FieldLabel>
                  <FieldLabel>Match Text <Input value={draft.matchText || ''} onChange={(e) => set('matchText', e.target.value)} placeholder="/merge or #deploy" /></FieldLabel>
                  <FieldLabel>From Users <Input value={draft.fromUsers || ''} onChange={(e) => set('fromUsers', e.target.value)} placeholder="user1, user2" /></FieldLabel>
                </>
              )}
            </>
          )}

          {node.type === 'agent' && (
            <div className="col-span-2 space-y-4">
              <FieldLabel>
                Assigned Agent Participant
                <Select value={draft.participantId || ''} onChange={(e) => set('participantId', e.target.value)}>
                  <option value="">-- Select Agent --</option>
                  {participants.filter(p => p.subject_type === 'agent').map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.subject_id}
                    </option>
                  ))}
                </Select>
              </FieldLabel>
              <div className="flex flex-col items-center justify-center py-4 text-center space-y-2 border-t mt-4">
                <Bot className="h-8 w-8 text-blue-400/50" />
                <div>
                  <p className="text-xs text-muted-foreground px-4">
                    Detailed agent configuration is managed in the <span className="font-semibold text-foreground">Agents & Participants</span> panel.
                  </p>
                </div>
              </div>
            </div>
          )}

          {node.type === 'guard' && (
            <>
              <div className="col-span-2">
                <FieldLabel>
                  Guard Type
                  <Select value={draft.guardType || 'code_merge'} onChange={(e) => set('guardType', e.target.value)}>
                    <option value="code_merge">Code Merge</option>
                    <option value="send_email">Send Email</option>
                    <option value="publish">Publish</option>
                    <option value="support_reply">Support Reply</option>
                    <option value="agent_action">Agent Action</option>
                    <option value="deployment">Deployment</option>
                    <option value="permission_escalation">Permission Escalation</option>
                  </Select>
                </FieldLabel>
              </div>
              <FieldLabel>
                <span className="flex items-center gap-1">
                  Quorum (%)
                  <span title="Minimum percentage of reviewers that must vote YES for the guard to allow. E.g. 70 = 70% must approve.">
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </span>
                </span>
                <Input type="number" step="1" min="0" max="100" value={Math.round((draft.quorum ?? 0.7) * 100)} onChange={(e) => set('quorum', Number(e.target.value) / 100)} />
              </FieldLabel>
              <FieldLabel>
                <span className="flex items-center gap-1">
                  Risk Threshold (%)
                  <span title="If the aggregated risk score from reviewers exceeds this percentage, the guard flags for rewrite. Lower = stricter.">
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </span>
                </span>
                <Input type="number" step="1" min="0" max="100" value={Math.round((draft.riskThreshold ?? 0.7) * 100)} onChange={(e) => set('riskThreshold', Number(e.target.value) / 100)} />
              </FieldLabel>
              <FieldLabel>
                <span className="flex items-center gap-1">
                  Agent Reviewers
                  <span title="Number of AI agent reviewers that will evaluate this guard.">
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </span>
                </span>
                <Input type="number" min="0" max="20" value={draft.numberOfAgents ?? 3} onChange={(e) => set('numberOfAgents', Number(e.target.value))} />
              </FieldLabel>
              <FieldLabel>
                <span className="flex items-center gap-1">
                  Human Reviewers
                  <span title="Number of human reviewers required for this guard.">
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </span>
                </span>
                <Input type="number" min="0" max="10" value={draft.numberOfHumans ?? 0} onChange={(e) => set('numberOfHumans', Number(e.target.value))} />
              </FieldLabel>

              {/* ── Guard-Type-Specific Settings ── */}
              <GuardSpecificSettings guardType={draft.guardType || 'code_merge'} draft={draft} set={set} />
            </>
          )}

          {node.type === 'hitl' && (
            <>
              <FieldLabel>
                Assigned Participant
                <Select value={draft.participantId || ''} onChange={(e) => set('participantId', e.target.value)}>
                  <option value="">-- Select Participant --</option>
                  {participants.filter(p => p.subject_type === 'human').map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.subject_id} ({p.subject_type})
                    </option>
                  ))}
                </Select>
              </FieldLabel>
              <FieldLabel>
                Prompt Mode
                {isGroupChild ? (
                  <Select value="yes-no" disabled className="opacity-60">
                    <option value="yes-no">Yes / No</option>
                  </Select>
                ) : (
                  <Select value={draft.promptMode || 'yes-no'} onChange={(e) => set('promptMode', e.target.value)}>
                    <option value="yes-no">Yes / No</option>
                    <option value="approve-reject-revise">Approve / Reject / Revise</option>
                    <option value="acknowledge">Acknowledge</option>
                  </Select>
                )}
              </FieldLabel>
              {isGroupChild && (
                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <FieldLabel>
                    Agent Weight (inherited)
                    <Input type="number" value={draft.weight ?? 1} disabled className="opacity-60" />
                  </FieldLabel>
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      type="checkbox"
                      id="weight-override"
                      checked={!!draft.weightOverride}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          set('weightOverride', false);
                          set('customWeight', undefined);
                        } else {
                          set('weightOverride', true);
                          set('customWeight', draft.customWeight ?? 1);
                        }
                      }}
                      className="rounded border-border"
                    />
                    <label htmlFor="weight-override" className="text-xs text-muted-foreground">Override weight</label>
                  </div>
                  {draft.weightOverride && (
                    <FieldLabel>
                      Custom Weight
                      <Input type="number" step="0.1" min="0" max="10" value={draft.customWeight ?? 1} onChange={(e) => set('customWeight', Number(e.target.value))} />
                    </FieldLabel>
                  )}
                </div>
              )}
              <FieldLabel>Timeout (sec) <Input type="number" value={draft.timeoutSec ?? 900} onChange={(e) => set('timeoutSec', Number(e.target.value))} /></FieldLabel>
            </>
          )}

          {node.type === 'action' && (
            <div className="col-span-2 space-y-3">
              <FieldLabel>
                Action
                <Select value={draft.action || ''} onChange={(e) => set('action', e.target.value)}>
                  <option value="">Select action...</option>
                  <option value="github.merge_pr">GitHub: Merge PR</option>
                  <option value="linear.create_subtasks">Linear: Create Subtasks</option>
                  <option value="linear.assign_subtasks">Linear: Assign Subtasks</option>
                </Select>
              </FieldLabel>
              {draft.action === 'github.merge_pr' && (
                <FieldLabel>
                  <span className="flex items-center gap-1">
                    Merge Strategy
                    <span title="How to merge the PR. Squash creates a single commit, Rebase replays commits inline, Merge adds a merge commit.">
                      <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                    </span>
                  </span>
                  <Select value={draft.mergeStrategy || 'merge'} onChange={(e) => set('mergeStrategy', e.target.value)}>
                    <option value="merge">Merge commit</option>
                    <option value="squash">Squash and merge</option>
                    <option value="rebase">Rebase and merge</option>
                  </Select>
                </FieldLabel>
              )}
            </div>
          )}

          {node.type === 'group' && (
            <div className="col-span-2">
              <GroupChildrenEditor groupChildren={draft.children || []} onChange={(children) => set('children', children)} />
            </div>
          )}

          {editing && (
            <div className="col-span-2 flex gap-2 pt-2 border-t">
              <Button size="sm" onClick={handleSave} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel} className="gap-1.5">
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cron event subtype config ──

function CronEventConfig({ source, draft, set }: { source: string; draft: Record<string, any>; set: (k: string, v: any) => void }) {
  const isLinear = source.startsWith('cron.linear.');
  const isGitHub = source.startsWith('cron.github.');

  return (
    <>
      {/* Shared: Cron expression */}
      <FieldLabel>
        <span className="flex items-center gap-1">
          Cron Expression
          <span title="Standard cron syntax: min hour dom mon dow. E.g. */15 * * * * = every 15 minutes, 0 9 * * 1-5 = weekdays at 9am.">
            <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
          </span>
        </span>
        <Input value={draft.cronExpression || '*/30 * * * *'} onChange={(e) => set('cronExpression', e.target.value)} placeholder="*/30 * * * *" />
      </FieldLabel>

      {/* Linear shared: Team + Project */}
      {isLinear && (
        <>
          <FieldLabel>Team ID <Input value={draft.team || ''} onChange={(e) => set('team', e.target.value)} placeholder="ENG" /></FieldLabel>
          <FieldLabel>Project (optional) <Input value={draft.project || ''} onChange={(e) => set('project', e.target.value)} placeholder="my-project" /></FieldLabel>
        </>
      )}

      {/* GitHub shared: Repo + Base Branch */}
      {isGitHub && (
        <>
          <FieldLabel>Repository <Input value={draft.repo || ''} onChange={(e) => set('repo', e.target.value)} placeholder="owner/repo" /></FieldLabel>
          <FieldLabel>Base Branch (optional) <Input value={draft.branch || ''} onChange={(e) => set('branch', e.target.value)} placeholder="main" /></FieldLabel>
        </>
      )}

      {/* ── Per-subtype fields ── */}

      {source === 'cron.linear.unassigned_subtasks' && (
        <div className="col-span-2">
          <FieldLabel>Member IDs (optional, comma-separated) <Input value={draft.memberIds || ''} onChange={(e) => set('memberIds', e.target.value)} placeholder="Leave empty to include all active members" /></FieldLabel>
        </div>
      )}

      {source === 'cron.linear.stale_tasks' && (
        <FieldLabel>
          <span className="flex items-center gap-1">
            Stale Threshold (days)
            <span title="Tasks not updated in this many days will be flagged.">
              <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
            </span>
          </span>
          <Input type="number" min="1" max="365" value={draft.staleDays ?? 7} onChange={(e) => set('staleDays', Number(e.target.value))} />
        </FieldLabel>
      )}

      {source === 'cron.linear.overdue_tasks' && (
        <FieldLabel>
          <span className="flex items-center gap-1">
            Min Priority
            <span title="Only include tasks at or above this priority level. Linear: Urgent > High > Medium > Low.">
              <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
            </span>
          </span>
          <Select value={draft.priorityFilter ?? '0'} onChange={(e) => set('priorityFilter', e.target.value)}>
            <option value="0">Any</option>
            <option value="1">Urgent</option>
            <option value="2">High</option>
            <option value="3">Medium</option>
          </Select>
        </FieldLabel>
      )}

      {source === 'cron.github.stale_prs' && (
        <FieldLabel>
          <span className="flex items-center gap-1">
            Stale Threshold (days)
            <span title="PRs with no activity in this many days will be flagged.">
              <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
            </span>
          </span>
          <Input type="number" min="1" max="365" value={draft.staleDays ?? 7} onChange={(e) => set('staleDays', Number(e.target.value))} />
        </FieldLabel>
      )}

      {source === 'cron.github.failed_checks' && (
        <FieldLabel>
          <span className="flex items-center gap-1">
            Failed For (hours)
            <span title="PRs with checks failing for at least this many hours will be flagged.">
              <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
            </span>
          </span>
          <Input type="number" min="0" max="720" value={draft.failedForHours ?? 6} onChange={(e) => set('failedForHours', Number(e.target.value))} />
        </FieldLabel>
      )}

      {source === 'cron.github.unreviewed_prs' && (
        <FieldLabel>
          <span className="flex items-center gap-1">
            Pending Review (days)
            <span title="PRs awaiting review for at least this many days will be flagged.">
              <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
            </span>
          </span>
          <Input type="number" min="0" max="365" value={draft.pendingDays ?? 2} onChange={(e) => set('pendingDays', Number(e.target.value))} />
        </FieldLabel>
      )}

      {source === 'cron.github.issue_triage' && (
        <div className="col-span-2 flex gap-6 py-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={draft.includeUnlabeled !== false}
              onChange={(e) => set('includeUnlabeled', e.target.checked)}
              className="rounded border-border"
            />
            Include Unlabeled Issues
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={draft.includeUnassigned !== false}
              onChange={(e) => set('includeUnassigned', e.target.checked)}
              className="rounded border-border"
            />
            Include Unassigned Issues
          </label>
        </div>
      )}

      {/* Info banner */}
      <div className="col-span-2 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400/90">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>{CRON_EVENT_HINTS[source] || 'Cron-triggered event — runs on the configured schedule.'}</span>
      </div>
    </>
  );
}

// ── Guard-type-specific icons ──
const GUARD_TYPE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  send_email: { icon: Mail, label: 'Email Guard', color: 'text-rose-400' },
  code_merge: { icon: GitMerge, label: 'Code Merge Guard', color: 'text-violet-400' },
  publish: { icon: Globe, label: 'Publish Guard', color: 'text-sky-400' },
  support_reply: { icon: MessageSquare, label: 'Support Reply Guard', color: 'text-teal-400' },
  agent_action: { icon: Cpu, label: 'Agent Action Guard', color: 'text-amber-400' },
  deployment: { icon: Rocket, label: 'Deployment Guard', color: 'text-orange-400' },
  permission_escalation: { icon: Lock, label: 'Permission Escalation Guard', color: 'text-red-400' },
};

function GuardSpecificSettings({ guardType, draft, set }: { guardType: string; draft: Record<string, any>; set: (k: string, v: any) => void }) {
  const meta = GUARD_TYPE_META[guardType];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <div className="col-span-2 border-t border-border/30 pt-3 mt-1 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${meta.color}`} />
        <span className="text-xs font-semibold text-foreground">{meta.label} Settings</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {guardType === 'send_email' && (
          <>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Recipient Allowlist
                <span title="Comma-separated email domains that are always allowed (e.g. company.com). Leave blank to allow all.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Input value={draft.recipientAllowlist ?? ''} onChange={(e) => set('recipientAllowlist', e.target.value)} placeholder="company.com, partner.org" />
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Recipient Blocklist
                <span title="Comma-separated email domains to always block (e.g. competitor.com).">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Input value={draft.recipientBlocklist ?? ''} onChange={(e) => set('recipientBlocklist', e.target.value)} placeholder="competitor.com" />
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Attachment Policy
                <span title="How to handle emails with attachments.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.attachmentPolicy ?? 'warn'} onChange={(e) => set('attachmentPolicy', e.target.value)}>
                <option value="allow">Allow</option>
                <option value="warn">Warn (flag for review)</option>
                <option value="block">Block</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Secrets Scanning
                <span title="Scan email body for API keys, tokens, passwords, and other secrets.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.secretsScanning === false ? 'off' : 'on'} onChange={(e) => set('secretsScanning', e.target.value === 'on')}>
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </Select>
            </FieldLabel>
          </>
        )}

        {guardType === 'code_merge' && (
          <>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Sensitive File Patterns
                <span title="Comma-separated path patterns that trigger elevated risk (e.g. auth/, *.key, security/).">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Input value={draft.sensitiveFilePatterns ?? 'auth,security,permission,crypto'} onChange={(e) => set('sensitiveFilePatterns', e.target.value)} placeholder="auth, security, *.key" />
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Required Reviewers
                <span title="Minimum number of human code reviewers required before merge.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Input type="number" min="0" max="10" value={draft.requiredReviewers ?? 1} onChange={(e) => set('requiredReviewers', Number(e.target.value))} />
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Protected Branches
                <span title="Comma-separated branch names that require stricter review (e.g. main, release/*).">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Input value={draft.protectedBranches ?? 'main'} onChange={(e) => set('protectedBranches', e.target.value)} placeholder="main, release/*" />
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                CI Required
                <span title="Require CI checks to pass before merge is allowed.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.ciRequired === false ? 'off' : 'on'} onChange={(e) => set('ciRequired', e.target.value === 'on')}>
                <option value="on">Required</option>
                <option value="off">Not Required</option>
              </Select>
            </FieldLabel>
          </>
        )}

        {guardType === 'publish' && (
          <>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Profanity Filter
                <span title="Scan content for profanity and flag for review.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.profanityFilter === false ? 'off' : 'on'} onChange={(e) => set('profanityFilter', e.target.value === 'on')}>
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                PII Detection
                <span title="Detect personally identifiable information (SSN, phone, email) in published content.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.piiDetection === false ? 'off' : 'on'} onChange={(e) => set('piiDetection', e.target.value === 'on')}>
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </Select>
            </FieldLabel>
            <div className="col-span-2">
              <FieldLabel>
                <span className="flex items-center gap-1">
                  Blocked Words
                  <span title="Comma-separated custom words or phrases to block from publishing.">
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </span>
                </span>
                <Input value={draft.blockedWords ?? ''} onChange={(e) => set('blockedWords', e.target.value)} placeholder="confidential, internal-only" />
              </FieldLabel>
            </div>
          </>
        )}

        {guardType === 'support_reply' && (
          <>
            <div className="col-span-2">
              <FieldLabel>
                <span className="flex items-center gap-1">
                  Escalation Keywords
                  <span title="Comma-separated keywords that trigger escalation (e.g. refund, lawsuit, legal action).">
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </span>
                </span>
                <Input value={draft.escalationKeywords ?? 'refund,lawsuit,legal action'} onChange={(e) => set('escalationKeywords', e.target.value)} placeholder="refund, lawsuit, legal action" />
              </FieldLabel>
            </div>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Auto-Escalate
                <span title="Automatically escalate to a human when escalation keywords are detected instead of just flagging.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.autoEscalate === false ? 'off' : 'on'} onChange={(e) => set('autoEscalate', e.target.value === 'on')}>
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Customer Tier
                <span title="Default customer tier for risk evaluation. Higher tiers get stricter review.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.customerTier ?? 'all'} onChange={(e) => set('customerTier', e.target.value)}>
                <option value="all">All Tiers</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </Select>
            </FieldLabel>
          </>
        )}

        {guardType === 'agent_action' && (
          <>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Action Type
                <span title="The type of action being guarded. Used as metadata sent to the parallel review agents (e.g. task_decomposition, tool_call).">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Input value={draft.actionType ?? ''} onChange={(e) => set('actionType', e.target.value)} placeholder="task_decomposition" />
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Irreversible Default
                <span title="Whether agent actions are treated as irreversible by default (require review).">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.irreversibleDefault ? 'on' : 'off'} onChange={(e) => set('irreversibleDefault', e.target.value === 'on')}>
                <option value="off">Reversible (lower risk)</option>
                <option value="on">Irreversible (require review)</option>
              </Select>
            </FieldLabel>
            <div className="col-span-2">
              <FieldLabel>
                <span className="flex items-center gap-1">
                  Evaluation Rubric (JSON)
                  <span title="JSON rubric with evaluation_criteria array. Sent to agents as the policy schema for structured review.">
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </span>
                </span>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono min-h-[80px] resize-y"
                  value={draft.evaluationRubric ?? ''}
                  onChange={(e) => set('evaluationRubric', e.target.value)}
                  placeholder={'{\n  "evaluation_criteria": [\n    "subtasks are logically ordered",\n    "no critical steps missing"\n  ]\n}'}
                />
              </FieldLabel>
            </div>
            <div className="col-span-2">
              <FieldLabel>
                <span className="flex items-center gap-1">
                  Tool Allowlist
                  <span title="Comma-separated MCP tool names that are allowed without review. Leave blank to review all.">
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </span>
                </span>
                <Input value={draft.toolAllowlist ?? ''} onChange={(e) => set('toolAllowlist', e.target.value)} placeholder="read_file, list_dir, grep_search" />
              </FieldLabel>
            </div>
            <div className="col-span-2">
              <FieldLabel>
                <span className="flex items-center gap-1">
                  Tool Blocklist
                  <span title="Comma-separated MCP tool names that always require review.">
                    <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </span>
                </span>
                <Input value={draft.toolBlocklist ?? ''} onChange={(e) => set('toolBlocklist', e.target.value)} placeholder="run_in_terminal, delete_file" />
              </FieldLabel>
            </div>
          </>
        )}

        {guardType === 'deployment' && (
          <>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Environment
                <span title="Target deployment environment. Production deployments get stricter review.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.deployEnv ?? 'prod'} onChange={(e) => set('deployEnv', e.target.value)}>
                <option value="dev">Development</option>
                <option value="staging">Staging</option>
                <option value="prod">Production</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Rollout Strategy
                <span title="How the deployment is rolled out.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.rolloutStrategy ?? 'all-at-once'} onChange={(e) => set('rolloutStrategy', e.target.value)}>
                <option value="canary">Canary</option>
                <option value="blue-green">Blue-Green</option>
                <option value="rolling">Rolling</option>
                <option value="all-at-once">All at Once</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Require Prod Approval
                <span title="Always require human approval for production deployments regardless of risk score.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.requireProdApproval === false ? 'off' : 'on'} onChange={(e) => set('requireProdApproval', e.target.value === 'on')}>
                <option value="on">Required</option>
                <option value="off">Not Required</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Rollback Enabled
                <span title="Whether automatic rollback is available if the deployment fails health checks.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.rollbackEnabled === false ? 'off' : 'on'} onChange={(e) => set('rollbackEnabled', e.target.value === 'on')}>
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </Select>
            </FieldLabel>
          </>
        )}

        {guardType === 'permission_escalation' && (
          <>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Break-Glass Default
                <span title="Whether escalation requests are treated as break-glass (emergency, bypasses normal approval) by default.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.breakGlassDefault ? 'on' : 'off'} onChange={(e) => set('breakGlassDefault', e.target.value === 'on')}>
                <option value="off">Normal Escalation</option>
                <option value="on">Break-Glass (emergency)</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Max Escalation Level
                <span title="Maximum number of escalation levels allowed (1-5). Higher levels require more approval.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Input type="number" min="1" max="5" value={draft.maxEscalationLevel ?? 3} onChange={(e) => set('maxEscalationLevel', Number(e.target.value))} />
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Require MFA
                <span title="Require multi-factor authentication for permission escalation approvals.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.requireMfa ? 'on' : 'off'} onChange={(e) => set('requireMfa', e.target.value === 'on')}>
                <option value="off">Not Required</option>
                <option value="on">Required</option>
              </Select>
            </FieldLabel>
            <FieldLabel>
              <span className="flex items-center gap-1">
                Environment
                <span title="Target environment for permission escalation. Production escalations get stricter review.">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </span>
              </span>
              <Select value={draft.permEnv ?? 'prod'} onChange={(e) => set('permEnv', e.target.value)}>
                <option value="dev">Development</option>
                <option value="staging">Staging</option>
                <option value="prod">Production</option>
              </Select>
            </FieldLabel>
          </>
        )}
      </div>
    </div>
  );
}

const GROUP_CHILD_TYPES: { type: NodeType; label: string }[] = [
  { type: 'agent', label: 'Agent' },
  { type: 'guard', label: 'Guard' },
  { type: 'hitl', label: 'Human Approval' },
  { type: 'action', label: 'Action' },
];

function childDefaults(type: NodeType): Record<string, any> {
  if (type === 'agent') return { model: 'gpt-5.4', temperature: 0, agentCount: 3, personaNames: '', systemPrompt: '' };
  if (type === 'hitl') return { promptMode: 'yes-no', timeoutSec: 900 };
  if (type === 'guard') return { guardType: 'code_merge', quorum: 0.7, riskThreshold: 0.7 };
  return { action: 'noop' };
}

function GroupChildrenEditor({ groupChildren, onChange }: { groupChildren: any[]; onChange: (children: any[]) => void }) {
  const [addType, setAddType] = useState<NodeType>('agent');

  function addChild() {
    const id = `${addType}-${Date.now().toString(36)}`;
    const labels: Record<string, string> = { agent: 'Agent', guard: 'Guard', hitl: 'Human Approval', action: 'Action' };
    onChange([...groupChildren, { id, type: addType, label: labels[addType] || addType, config: childDefaults(addType) }]);
  }

  function removeChild(id: string) {
    onChange(groupChildren.filter((c: any) => c.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">Parallel Children ({groupChildren.length})</div>
      {groupChildren.map((child: any) => {
        const paletteItem = PALETTE.find((p) => p.type === child.type);
        const Icon = paletteItem?.icon;
        return (
          <div key={child.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/50 bg-accent/20">
            {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${NODE_ICON_COLORS[child.type as NodeType] || ''}`} />}
            <span className="text-xs flex-1 truncate">{child.label}</span>
            <Badge variant="outline" className="text-[10px]">{child.type}</Badge>
            <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => removeChild(child.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Select value={addType} onChange={(e) => setAddType(e.target.value as NodeType)} className="flex-1">
          {GROUP_CHILD_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </Select>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={addChild}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Click a child on the canvas to edit its settings individually.</p>
    </div>
  );
}

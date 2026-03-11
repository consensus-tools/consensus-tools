import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Bot, Save, Pencil, MessageSquare, User, Trash2, Cpu, Globe, Key, Thermometer, TrendingUp } from 'lucide-react';
import { connectAgent, listAgents, listParticipants, createParticipant, updateParticipant, assignPolicy, deleteParticipant } from '../../lib/api';

const CHAT_ADAPTERS = [
  { value: '', label: 'None' },
  { value: 'slack', label: 'Slack' },
  { value: 'discord', label: 'Discord' },
  { value: 'teams', label: 'Teams' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'googlechat', label: 'Google Chat' },
];

const AI_MODELS = [
  // OpenAI
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.4-pro', label: 'GPT-5.4 Pro' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'gpt-5.1', label: 'GPT-5.1' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  // Anthropic
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];

interface AgentsPanelProps {
  boardId: string;
  workflowNodes?: any[];
}

export function AgentsPanel({ boardId, workflowNodes = [] }: AgentsPanelProps) {
  const [participants, setParticipants] = useState<any[]>([]);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showAddHuman, setShowAddHuman] = useState(false);
  const [agentStep, setAgentStep] = useState<'choose' | 'internal' | 'external'>('choose');
  const [humanName, setHumanName] = useState('');

  const [internalForm, setInternalForm] = useState({ name: '', model: 'gpt-5.4', systemPrompt: '', temperature: '0.0' });
  const [externalForm, setExternalForm] = useState({ name: '', chatAdapter: '', chatHandle: '' });
  const [newApiKey, setNewApiKey] = useState('');

  const [editingParticipant, setEditingParticipant] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});

  function parseMetadata(p: any): Record<string, any> {
    try {
      return JSON.parse(p.metadata_json || '{}');
    } catch {
      return {};
    }
  }

  async function refresh() {
    try {
      const p = await listParticipants(boardId);
      setParticipants(p.participants || []);
    } catch {}
  }

  useEffect(() => { refresh(); }, [boardId]);

  function openAddAgent() {
    setAgentStep('choose');
    setInternalForm({ name: '', model: 'gpt-5.4', systemPrompt: '', temperature: '0.0' });
    setExternalForm({ name: '', chatAdapter: '', chatHandle: '' });
    setNewApiKey('');
    setShowAddAgent(true);
  }

  async function handleAddInternal() {
    if (!internalForm.name.trim()) return;
    try {
      await createParticipant({
        boardId,
        subjectType: 'agent',
        subjectId: internalForm.name.trim(),
        role: 'voter',
        weight: 1,
        reputation: 100,
        metadata: {
          agentType: 'internal',
          model: internalForm.model,
          systemPrompt: internalForm.systemPrompt,
          temperature: parseFloat(internalForm.temperature) || 0,
        },
      });
      await assignPolicy({ boardId, policyId: 'default', participants: [internalForm.name.trim()], weightingMode: 'hybrid', quorum: 0.6 });
      setShowAddAgent(false);
      await refresh();
    } catch {}
  }

  async function handleAddExternal() {
    if (!externalForm.name.trim()) return;
    try {
      const r = await connectAgent({
        name: externalForm.name.trim(),
        scopes: ['guard.evaluate', 'workflow.run', 'human.approve'],
        boards: [boardId],
      });
      setNewApiKey(r.agent?.apiKey || '');
      await createParticipant({
        boardId,
        subjectType: 'agent',
        subjectId: externalForm.name.trim(),
        role: 'voter',
        weight: 1,
        reputation: 100,
        metadata: {
          agentType: 'external',
          agentRegistryId: r.agent?.id || '',
          chatAdapter: externalForm.chatAdapter,
          chatHandle: externalForm.chatHandle,
        },
      });
      await assignPolicy({ boardId, policyId: 'default', participants: [externalForm.name.trim()], weightingMode: 'hybrid', quorum: 0.6 });
      await refresh();
    } catch {}
  }

  async function handleAddHuman() {
    if (!humanName.trim()) return;
    try {
      await createParticipant({
        boardId,
        subjectType: 'human',
        subjectId: humanName.trim(),
        role: 'voter',
        weight: 1,
        reputation: 100,
      });
      setHumanName('');
      setShowAddHuman(false);
      await refresh();
    } catch {}
  }

  function startEdit(p: any) {
    const meta = parseMetadata(p);
    setEditingParticipant(p.id);
    setEditDraft({
      weight: p.weight,
      reputation: p.reputation,
      role: p.role || 'voter',
      agentType: meta.agentType || '',
      agentRegistryId: meta.agentRegistryId || '',
      model: meta.model || 'gpt-5.4',
      systemPrompt: meta.systemPrompt || '',
      temperature: meta.temperature ?? 0,
      chatAdapter: meta.chatAdapter || '',
      chatHandle: meta.chatHandle || '',
    });
  }

  async function saveEdit(id: string) {
    try {
      const isInternal = editDraft.agentType === 'internal';
      const metadata: Record<string, any> = { agentType: editDraft.agentType || '' };
      if (isInternal) {
        metadata.model = editDraft.model;
        metadata.systemPrompt = editDraft.systemPrompt;
        metadata.temperature = Math.max(0, Math.min(2, parseFloat(editDraft.temperature) || 0));
      } else {
        metadata.chatAdapter = editDraft.chatAdapter || '';
        metadata.chatHandle = editDraft.chatHandle || '';
        if (editDraft.agentRegistryId) metadata.agentRegistryId = editDraft.agentRegistryId;
      }
      await updateParticipant(id, {
        weight: Number(editDraft.weight),
        reputation: Number(editDraft.reputation),
        metadata,
      });
      setEditingParticipant(null);
      await refresh();
    } catch {}
  }

  async function handleDeleteParticipant(id: string) {
    try {
      await deleteParticipant(id);
      setEditingParticipant(null);
      await refresh();
    } catch {}
  }

  const humanParticipants = participants.filter(p => p.subject_type === 'human');
  const agentParticipants = participants.filter(p => p.subject_type === 'agent');

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5" /> Agents & Participants
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={openAddAgent} className="gap-1.5 h-7 text-xs">
              <Bot className="h-3 w-3" /> +Agent
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddHuman(true)} className="gap-1.5 h-7 text-xs">
              <User className="h-3 w-3" /> +Human
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 overflow-y-auto">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <User className="h-3 w-3" /> Humans
          </div>
          {humanParticipants.length === 0 && <p className="text-[10px] text-muted-foreground pl-4">No human participants</p>}
          {humanParticipants.map((p) => (
            <ParticipantCard
              key={p.id}
              p={p}
              editingParticipant={editingParticipant}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              saveEdit={saveEdit}
              startEdit={startEdit}
              setEditingParticipant={setEditingParticipant}
              parseMetadata={parseMetadata}
              onDelete={handleDeleteParticipant}
            />
          ))}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Bot className="h-3 w-3" /> Agents
          </div>
          {agentParticipants.length === 0 && <p className="text-[10px] text-muted-foreground pl-4">No agent participants</p>}
          {agentParticipants.map((p) => (
            <ParticipantCard
              key={p.id}
              p={p}
              editingParticipant={editingParticipant}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              saveEdit={saveEdit}
              startEdit={startEdit}
              setEditingParticipant={setEditingParticipant}
              parseMetadata={parseMetadata}
              onDelete={handleDeleteParticipant}
            />
          ))}
        </div>
      </CardContent>

      <Dialog open={showAddAgent} onOpenChange={setShowAddAgent}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {agentStep === 'choose' && 'Add Agent'}
              {agentStep === 'internal' && 'Add Internal Agent (AI SDK)'}
              {agentStep === 'external' && 'Add External Agent (API)'}
            </DialogTitle>
            <DialogDescription>
              {agentStep === 'choose' && 'Choose the type of agent to add to this board.'}
              {agentStep === 'internal' && 'This agent runs locally using the Vercel AI SDK.'}
              {agentStep === 'external' && 'This agent connects remotely via API key.'}
            </DialogDescription>
          </DialogHeader>

          {agentStep === 'choose' && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setAgentStep('internal')}
                className="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-border/50 bg-card hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-left group"
              >
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <Cpu className="h-5 w-5 text-blue-400" />
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium">Internal</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">AI SDK · Runs locally</div>
                </div>
              </button>
              <button
                onClick={() => setAgentStep('external')}
                className="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-border/50 bg-card hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left group"
              >
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                  <Globe className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium">External</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">API Key · Chat-SDK</div>
                </div>
              </button>
            </div>
          )}

          {agentStep === 'internal' && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Agent Name</label>
                <Input value={internalForm.name} onChange={(e) => setInternalForm({ ...internalForm, name: e.target.value })} placeholder="e.g. security-reviewer" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Model</label>
                  <Select value={internalForm.model} onChange={(e) => setInternalForm({ ...internalForm, model: e.target.value })}>
                    {AI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Temperature</label>
                  <Input type="number" min="0" max="2" step="0.1" value={internalForm.temperature} onChange={(e) => setInternalForm({ ...internalForm, temperature: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">System Prompt</label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  value={internalForm.systemPrompt}
                  onChange={(e) => setInternalForm({ ...internalForm, systemPrompt: e.target.value })}
                  placeholder="You are a strict code reviewer focused on security..."
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setAgentStep('choose')}>Back</Button>
                <Button onClick={handleAddInternal} disabled={!internalForm.name.trim()}>
                  <Cpu className="h-3.5 w-3.5 mr-1.5" /> Create Agent
                </Button>
              </div>
            </div>
          )}

          {agentStep === 'external' && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Agent Name</label>
                <Input value={externalForm.name} onChange={(e) => setExternalForm({ ...externalForm, name: e.target.value })} placeholder="e.g. my-slack-bot" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Chat Adapter</label>
                  <Select value={externalForm.chatAdapter} onChange={(e) => setExternalForm({ ...externalForm, chatAdapter: e.target.value })}>
                    {CHAT_ADAPTERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Handle / ID</label>
                  <Input value={externalForm.chatHandle} onChange={(e) => setExternalForm({ ...externalForm, chatHandle: e.target.value })} placeholder="@user or channel" />
                </div>
              </div>
              {newApiKey && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                    <Key className="h-3.5 w-3.5" /> API Key Created
                  </div>
                  <code className="text-xs bg-background px-2 py-1 rounded block truncate select-all">{newApiKey}</code>
                  <p className="text-[10px] text-muted-foreground">Copy this key now — it won't be shown again.</p>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setAgentStep('choose'); setNewApiKey(''); }}>Back</Button>
                {!newApiKey ? (
                  <Button onClick={handleAddExternal} disabled={!externalForm.name.trim()}>
                    <Globe className="h-3.5 w-3.5 mr-1.5" /> Connect Agent
                  </Button>
                ) : (
                  <Button onClick={() => setShowAddAgent(false)}>Done</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAddHuman} onOpenChange={setShowAddHuman}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Human Participant</DialogTitle>
            <DialogDescription>Add a human voter or approver to this board.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name or ID</label>
              <Input value={humanName} onChange={(e) => setHumanName(e.target.value)} placeholder="e.g. alice, @alice" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddHuman(false)}>Cancel</Button>
              <Button onClick={handleAddHuman} disabled={!humanName.trim()}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ParticipantCard({ p, editingParticipant, editDraft, setEditDraft, saveEdit, startEdit, setEditingParticipant, parseMetadata, onDelete }: any) {
  const meta = parseMetadata(p);
  const isInternal = meta.agentType === 'internal';
  const isExternal = meta.agentType === 'external';
  const isAgent = p.subject_type === 'agent';

  return (
    <div className="rounded-md border border-border/50 px-2 py-1.5 bg-card/50">
      {editingParticipant === p.id ? (
        <div className="space-y-2.5">
          <div className="text-xs font-medium text-foreground flex items-center gap-2">
            {p.subject_id}
            {isInternal && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4"><Cpu className="h-2.5 w-2.5 mr-0.5" /> Internal</Badge>}
            {isExternal && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4"><Globe className="h-2.5 w-2.5 mr-0.5" /> External</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Weight (override)</label>
              <Input className="h-7 text-xs" type="number" step="0.1" value={editDraft.weight} onChange={(e) => setEditDraft({ ...editDraft, weight: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                Reputation <TrendingUp className="h-2.5 w-2.5" />
              </label>
              <div className="h-7 flex items-center px-2 rounded-md border border-border bg-muted/50 text-xs text-muted-foreground tabular-nums">
                {editDraft.reputation}
                <span className="ml-auto text-[9px] opacity-60">ledger</span>
              </div>
            </div>
          </div>

          {isInternal && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Model</label>
                  <Select className="h-7 text-xs" value={editDraft.model} onChange={(e) => setEditDraft({ ...editDraft, model: e.target.value })}>
                    {AI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Temperature</label>
                  <Input className="h-7 text-xs" type="number" min="0" max="2" step="0.1" value={editDraft.temperature} onChange={(e) => setEditDraft({ ...editDraft, temperature: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">System Prompt</label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs min-h-[50px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  value={editDraft.systemPrompt}
                  onChange={(e) => setEditDraft({ ...editDraft, systemPrompt: e.target.value })}
                  placeholder="System prompt..."
                />
              </div>
            </>
          )}

          {!isInternal && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Chat Adapter</label>
                <Select className="h-7 text-xs" value={editDraft.chatAdapter} onChange={(e) => setEditDraft({ ...editDraft, chatAdapter: e.target.value })}>
                  {CHAT_ADAPTERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Handle / ID</label>
                <Input className="h-7 text-xs" value={editDraft.chatHandle} onChange={(e) => setEditDraft({ ...editDraft, chatHandle: e.target.value })} placeholder="@user or ID" />
              </div>
            </div>
          )}

          <div className="flex gap-1.5 pt-1">
            <Button size="sm" className="h-6 text-xs" onClick={() => saveEdit(p.id)}><Save className="h-3 w-3 mr-1" /> Save</Button>
            <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => onDelete(p.id)}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingParticipant(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-xs font-medium truncate">{p.subject_id}</span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap" title={`Weight: ${p.weight} (override) · Reputation: ${p.reputation} (ledger) · Effective: ${(p.weight * p.reputation / 100).toFixed(2)}`}>
              w:{p.weight} r:{p.reputation}
            </span>
            {isInternal && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 gap-0.5">
                <Cpu className="h-2.5 w-2.5" /> {meta.model || 'ai-sdk'}
              </Badge>
            )}
            {isExternal && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 gap-0.5">
                <Globe className="h-2.5 w-2.5" /> API
              </Badge>
            )}
            {meta.chatAdapter && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 gap-0.5">
                <MessageSquare className="h-2.5 w-2.5" /> {meta.chatAdapter}
              </Badge>
            )}
          </div>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(p)}><Pencil className="h-3 w-3" /></Button>
        </div>
      )}
    </div>
  );
}

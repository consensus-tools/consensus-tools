import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { NodePalette, type NodeType } from '../components/workflow/NodePalette';
import { NodeCanvas, type WorkflowNode } from '../components/workflow/NodeCanvas';
import { NodeSettings } from '../components/workflow/NodeSettings';
import { EventTimeline } from '../components/workflow/EventTimeline';
import { AgentsPanel } from '../components/agents/AgentsPanel';
import { WorkflowToolbar } from '../components/workflow/WorkflowToolbar';
import {
  getWorkflows, getWorkflow, createWorkflow, updateWorkflow,
  deleteWorkflow as apiDeleteWorkflow,
  runWorkflow, approveWorkflowRun, getBoards, createBoard,
  getTemplates, getTemplate
} from '../lib/api';
import { Play, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

function defaults(type: NodeType): Record<string, any> {
  if (type === 'agent') return { model: 'gpt-5.4', temperature: 0, toolAccess: 'restricted', agentCount: 1, personaMode: 'auto', personaNames: '', systemPrompt: '' };
  if (type === 'guard') return { guardType: 'code_merge', quorum: 0.7, riskThreshold: 0.7, policyBinding: 'explicit', numberOfAgents: 3, numberOfHumans: 0, weights: { security: 0.5, reliability: 0.3, performance: 0.2 } };
  if (type === 'hitl') return { channel: 'slack', promptMode: 'yes-no', timeoutSec: 900, weightMode: 'weighted', requiredVotes: 2 };
  if (type === 'trigger') return { source: 'github.pr.opened', provider: 'github-mcp', repo: '', branch: 'main', channel: 'slack', chatType: 'group', matchText: '', fromUsers: '' };
  if (type === 'group') return { children: [] };
  return { action: 'noop' };
}

function findNodeById(nodes: WorkflowNode[], id: string): WorkflowNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.type === 'group' && Array.isArray(n.config?.children)) {
      const child = n.config.children.find((c: any) => c.id === id);
      if (child) return child;
    }
  }
  return null;
}

const STATUS_ICON: Record<string, React.ElementType> = {
  COMPLETED: CheckCircle,
  WAITING_HUMAN: Clock,
  FAILED: AlertTriangle,
};

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'text-emerald-400',
  WAITING_HUMAN: 'text-amber-400',
  FAILED: 'text-destructive',
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'COMPLETED',
  WAITING_HUMAN: 'WAITING APPROVAL',
  FAILED: 'FAILED',
};

export default function WorkflowsDashboard() {
  const [name, setName] = useState('workflow-1');
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [saved, setSaved] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [boardId] = useState('workflow-system');

  const selected = useMemo(() => findNodeById(nodes, selectedId || '') || null, [nodes, selectedId]);
  const isGroupChild = useMemo(() => {
    if (!selectedId) return false;
    return nodes.some(n => n.type === 'group' && Array.isArray(n.config?.children) && n.config.children.some((c: any) => c.id === selectedId));
  }, [nodes, selectedId]);

  async function ensureDefaultBoard() {
    try {
      const d = await getBoards();
      const boards = d.boards || [];
      const existing = boards.find((b: any) => b.name === 'workflow-system');
      if (!existing) {
        await createBoard('workflow-system');
      }
    } catch {}
  }

  async function refreshList() {
    try {
      const [d, t] = await Promise.all([getWorkflows(), getTemplates()]);
      const items = d.workflows || [];
      setSaved(items);
      setTemplates(t.templates || []);
      if (!workflowId && items.length) {
        await loadWorkflow(items[0].id);
      }
    } catch {}
  }

  useEffect(() => { ensureDefaultBoard(); refreshList(); }, []);

  async function loadWorkflow(id: string) {
    const d = await getWorkflow(id);
    const def = JSON.parse(d.workflow.definition_json || '{}');
    setWorkflowId(id);
    setName(d.workflow.name);
    setNodes(def.nodes || []);
    setRuns(d.runs || []);
    setSelectedId(null);
  }

  function addNode(type: NodeType) {
    const id = `${type}-${Date.now().toString(36)}`;
    const labels: Record<NodeType, string> = {
      trigger: 'Trigger',
      agent: 'Agent',
      guard: 'Guard',
      hitl: 'Human Approval',
      group: 'Parallel Group',
      action: 'Action',
    };
    
    setNodes((prev) => {
      const newNode = { id, type, label: labels[type], config: defaults(type) };
      const nextNodes = [...prev, newNode];
      
      if (type === 'guard') {
        const guardConfig = defaults('guard');
        const agentCount = guardConfig.numberOfAgents || 3;
        const humanCount = guardConfig.numberOfHumans || 0;
        const ts = Date.now().toString(36);
        const groupId = `group-${ts}`;
        const agentChildren = Array.from({ length: agentCount }, (_, i) => ({
          id: `agent-${ts}-${i}`,
          type: 'agent' as NodeType,
          label: 'Agent',
          config: defaults('agent'),
        }));
        const hitlChildren = Array.from({ length: humanCount }, (_, i) => ({
          id: `hitl-${ts}-${i}`,
          type: 'hitl' as NodeType,
          label: 'Human Approval',
          config: defaults('hitl'),
        }));
        const groupNode = { 
          id: groupId, 
          type: 'group' as NodeType, 
          label: 'Parallel Review', 
          config: { 
            linkedGuardId: id,
            children: [...agentChildren, ...hitlChildren]
          } 
        };
        // Agents run first (produce verdicts), guard resolves after
        const withoutGuard = nextNodes.slice(0, -1);
        return [...withoutGuard, groupNode, newNode];
      }
      
      return nextNodes;
    });
    setSelectedId(id);
  }

  function deleteNode(id: string) {
    setNodes((prev) => {
      const topLevel = prev.find((n) => n.id === id);
      if (topLevel) return prev.filter((n) => n.id !== id);
      return prev.map((n) => {
        if (n.type === 'group' && Array.isArray(n.config?.children)) {
          const filtered = n.config.children.filter((c: any) => c.id !== id);
          if (filtered.length !== n.config.children.length) {
            return { ...n, config: { ...n.config, children: filtered } };
          }
        }
        return n;
      });
    });
    if (selectedId === id) setSelectedId(null);
  }

  function handleUpdateConfig(id: string, config: Record<string, any>) {
    setNodes((prev) => {
      const updated = prev.map((n) => {
        if (n.id === id) return { ...n, config };
        if (n.type === 'group' && Array.isArray(n.config?.children)) {
          const childIdx = n.config.children.findIndex((c: any) => c.id === id);
          if (childIdx >= 0) {
            const newChildren = [...n.config.children];
            newChildren[childIdx] = { ...newChildren[childIdx], config };
            return { ...n, config: { ...n.config, children: newChildren } };
          }
        }
        return n;
      });

      const guardIdx = updated.findIndex((n) => n.id === id);
      const guardNode = guardIdx >= 0 ? updated[guardIdx] : null;
      if (guardNode && guardNode.type === 'guard' && (config.numberOfAgents != null || config.numberOfHumans != null)) {
        const linkedGroup = updated.find((n) =>
          n.type === 'group' && n.config?.linkedGuardId === id
        ) || updated.find((n, i) => i > guardIdx && n.type === 'group');
        if (linkedGroup && Array.isArray(linkedGroup.config?.children)) {
          const currentAgents = linkedGroup.config.children.filter((c: any) => c.type === 'agent');
          const currentHitls = linkedGroup.config.children.filter((c: any) => c.type === 'hitl');
          const otherChildren = linkedGroup.config.children.filter((c: any) => c.type !== 'agent' && c.type !== 'hitl');

          const desiredAgents = config.numberOfAgents != null
            ? Math.max(0, Math.min(20, Math.floor(Number(config.numberOfAgents)) || 0))
            : currentAgents.length;
          const desiredHumans = config.numberOfHumans != null
            ? Math.max(0, Math.min(10, Math.floor(Number(config.numberOfHumans)) || 0))
            : currentHitls.length;

          if (currentAgents.length !== desiredAgents || currentHitls.length !== desiredHumans) {
            const ts = Date.now().toString(36);
            let newAgents = [...currentAgents];
            if (desiredAgents > currentAgents.length) {
              for (let i = currentAgents.length; i < desiredAgents; i++) {
                newAgents.push({ id: `agent-${ts}-${i}`, type: 'agent', label: 'Agent', config: defaults('agent') });
              }
            } else {
              newAgents = newAgents.slice(0, desiredAgents);
            }

            let newHitls = [...currentHitls];
            if (desiredHumans > currentHitls.length) {
              for (let i = currentHitls.length; i < desiredHumans; i++) {
                newHitls.push({ id: `hitl-${ts}-${i}`, type: 'hitl', label: 'Human Approval', config: defaults('hitl') });
              }
            } else {
              newHitls = newHitls.slice(0, desiredHumans);
            }

            return updated.map((n) => {
              if (n.id === linkedGroup.id) {
                return { ...n, config: { ...n.config, children: [...newAgents, ...newHitls, ...otherChildren] } };
              }
              return n;
            });
          }
        }
      }

      return updated;
    });
  }

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  async function saveWorkflow() {
    try {
      setIsSaving(true);
      const definition = { boardId, nodes };
      if (!workflowId) {
        const out = await createWorkflow(name, definition);
        setWorkflowId(out.workflow.id);
      } else {
        await updateWorkflow(workflowId, { name, definition });
      }
      await refreshList();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save workflow:', error);
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAsWorkflow(newName: string) {
    try {
      setIsSaving(true);
      const definition = { boardId, nodes };
      const out = await createWorkflow(newName, definition);
      setWorkflowId(out.workflow.id);
      setName(newName);
      await refreshList();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save as workflow:', error);
    } finally {
      setIsSaving(false);
    }
  }

  function newWorkflow() {
    setWorkflowId(null);
    setName('Untitled Workflow');
    setNodes([]);
    setRuns([]);
    setSelectedId(null);
  }

  async function handleDelete() {
    if (!workflowId) return;
    try {
      await apiDeleteWorkflow(workflowId);
      newWorkflow();
      await refreshList();
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    }
  }

  async function executeWorkflow() {
    if (!workflowId) return;
    await runWorkflow(workflowId);
    await loadWorkflow(workflowId);
  }

  async function handleLoadTemplate(templateId: string) {
    try {
      const result = await getTemplate(templateId);
      if (result.template) {
        setWorkflowId(null);
        setName(result.template.name);
        setNodes(result.template.definition?.nodes || []);
        setRuns([]);
        setSelectedId(null);
      }
    } catch (error) {
      console.error('Failed to load template:', error);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const type = e.dataTransfer.getData('node-type') as NodeType;
    if (!type) return;
    addNode(type);
  }

  return (
    <div className="mx-auto max-w-screen-2xl p-4 space-y-4">
      <WorkflowToolbar
        name={name}
        workflowId={workflowId}
        saved={saved}
        templates={templates}
        isTemplate={templates.some((t) => t.name === name)}
        onNameChange={(n) => { setName(n); if (workflowId) updateWorkflow(workflowId, { name: n }).then(refreshList); }}
        onSave={saveWorkflow}
        onSaveAs={saveAsWorkflow}
        onNew={newWorkflow}
        onDelete={handleDelete}
        onRun={executeWorkflow}
        onLoad={loadWorkflow}
        onLoadTemplate={handleLoadTemplate}
        isSaving={isSaving}
        saveSuccess={saveSuccess}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-2 flex flex-col">
          <NodePalette onAdd={addNode} />
        </div>

        <div className="lg:col-span-4 flex flex-col h-[600px]">
          <NodeCanvas
            nodes={nodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={deleteNode}
            onReorder={setNodes}
            onDrop={onDrop}
          />
        </div>

        <div className="lg:col-span-6 flex flex-col gap-4 h-[600px]">
          <div className="flex-1 min-h-0">
            <NodeSettings node={selected} onUpdate={handleUpdateConfig} boardId={boardId} isGroupChild={isGroupChild} />
          </div>
          <div className="flex-1 min-h-0">
            <EventTimeline />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-6 flex flex-col">
          <Card className="flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Play className="h-3.5 w-3.5" /> Workflow Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!runs.length && (
                <p className="text-sm text-muted-foreground py-4 text-center">No runs yet. Save and run your workflow.</p>
              )}
              <div className="space-y-2">
                {runs.map((r: any) => {
                  const StatusIcon = STATUS_ICON[r.status] || Clock;
                  const statusColor = STATUS_COLOR[r.status] || 'text-muted-foreground';
                  const statusLabel = STATUS_LABEL[r.status] || r.status;
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-md border border-border/50 hover:bg-accent/30 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusIcon className={`h-4 w-4 shrink-0 ${statusColor}`} />
                        <Badge variant="outline" className="text-[10px] shrink-0">{statusLabel}</Badge>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{r.engine || 'local'}</Badge>
                        <Link to={`/boards/run/${r.run_id}`} className="text-sm text-primary hover:underline truncate">
                          {r.run_id}
                        </Link>
                      </div>
                      {r.status === 'WAITING_HUMAN' && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            className="h-6 text-xs"
                            onClick={async () => { await approveWorkflowRun(r.run_id, 'YES', 'human'); await loadWorkflow(workflowId!); }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 text-xs"
                            onClick={async () => { await approveWorkflowRun(r.run_id, 'NO', 'human'); await loadWorkflow(workflowId!); }}
                          >
                            Block
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-6 flex flex-col">
          <AgentsPanel boardId={boardId} workflowNodes={nodes} />
        </div>
      </div>
    </div>
  );
}

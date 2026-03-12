import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Zap, Shield, Users, Bot, Play, Layers } from 'lucide-react';

export type NodeType = 'trigger' | 'agent' | 'guard' | 'hitl' | 'action' | 'group';

export const PALETTE: { type: NodeType; label: string; icon: React.ElementType; color: string }[] = [
  { type: 'trigger', label: 'Trigger', icon: Zap, color: 'text-amber-400' },
  { type: 'agent', label: 'Agent', icon: Bot, color: 'text-blue-400' },
  { type: 'guard', label: 'Guard', icon: Shield, color: 'text-emerald-400' },
  { type: 'hitl', label: 'Human Approval', icon: Users, color: 'text-purple-400' },
  { type: 'action', label: 'Action', icon: Play, color: 'text-orange-400' },
];

export const NODE_COLORS: Record<NodeType, string> = {
  trigger: 'border-amber-500/40 bg-amber-500/5',
  agent: 'border-blue-500/40 bg-blue-500/5',
  guard: 'border-emerald-500/40 bg-emerald-500/5',
  hitl: 'border-purple-500/40 bg-purple-500/5',
  action: 'border-orange-500/40 bg-orange-500/5',
  group: 'border-cyan-500/40 bg-cyan-500/5',
};

export const NODE_ICON_COLORS: Record<NodeType, string> = {
  trigger: 'text-amber-400',
  agent: 'text-blue-400',
  guard: 'text-emerald-400',
  hitl: 'text-purple-400',
  action: 'text-orange-400',
  group: 'text-cyan-400',
};

interface NodePaletteProps {
  onAdd: (type: NodeType) => void;
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle>Node Palette</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 flex-1 overflow-y-auto">
        {PALETTE.map((p) => (
          <button
            key={p.type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('node-type', p.type)}
            onClick={() => onAdd(p.type)}
            className="flex w-full items-center gap-3 rounded-md border border-border/50 bg-card px-3 py-2.5 text-sm transition-all hover:border-primary/50 hover:bg-accent cursor-grab active:cursor-grabbing text-left"
          >
            <p.icon className={`h-4 w-4 shrink-0 ${p.color}`} />
            <span>{p.label}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

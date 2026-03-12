import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '../ui/dialog';
import {
  Play, Save, FilePlus, FolderOpen, Pencil, Copy,
  ChevronDown, Check, X, Workflow, LayoutTemplate, Trash2
} from 'lucide-react';

export type TemplateItem = {
  id: string;
  name: string;
  nodeCount: number;
};

interface WorkflowToolbarProps {
  name: string;
  workflowId: string | null;
  saved: any[];
  templates: TemplateItem[];
  isTemplate?: boolean;
  onNameChange: (name: string) => void;
  onSave: () => Promise<void>;
  onSaveAs: (newName: string) => Promise<void>;
  onNew: () => void;
  onDelete: () => Promise<void>;
  onRun: () => Promise<void>;
  onLoad: (id: string) => Promise<void>;
  onLoadTemplate: (id: string) => Promise<void>;
  isSaving?: boolean;
  saveSuccess?: boolean;
}

export function WorkflowToolbar({
  name, workflowId, saved, templates, isTemplate,
  onNameChange, onSave, onSaveAs, onNew, onDelete, onRun, onLoad, onLoadTemplate,
  isSaving, saveSuccess
}: WorkflowToolbarProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(name);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [showLoad, setShowLoad] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const loadRef = useRef<HTMLDivElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    setRenameValue(name);
  }, [name]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (loadRef.current && !loadRef.current.contains(e.target as Node)) {
        setShowLoad(false);
      }
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    }
    if (showLoad || showTemplates) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showLoad, showTemplates]);

  function handleRenameConfirm() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== name) {
      onNameChange(trimmed);
    }
    setRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleRenameConfirm();
    if (e.key === 'Escape') { setRenameValue(name); setRenaming(false); }
  }

  async function handleSaveAs() {
    const trimmed = saveAsName.trim();
    if (!trimmed) return;
    await onSaveAs(trimmed);
    setShowSaveAs(false);
    setSaveAsName('');
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <Workflow className="h-4 w-4 text-primary shrink-0" />

          {renaming ? (
            <div className="flex items-center gap-1.5">
              <Input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameConfirm}
                className="h-7 w-52 text-sm"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={handleRenameConfirm}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setRenameValue(name); setRenaming(false); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              className="group flex items-center gap-2 min-w-0 hover:text-primary transition-colors"
              onClick={() => setRenaming(true)}
            >
              <span className="font-medium text-sm">{name}</span>
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-7 text-xs"
            onClick={onNew}
          >
            <FilePlus className="h-3.5 w-3.5" /> New
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            disabled={!workflowId || isTemplate}
            title={!workflowId ? 'No saved workflow to delete' : isTemplate ? 'Cannot delete a template' : 'Delete this workflow'}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          <Button
            size="sm"
            variant="ghost"
            className={`gap-1.5 h-7 text-xs transition-all duration-300 ${saveSuccess ? 'text-emerald-500 bg-emerald-500/10' : ''}`}
            onClick={onSave}
            disabled={isSaving || isTemplate}
            title={isTemplate ? 'Use Save As to create a copy of this template' : undefined}
          >
            {saveSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 animate-in zoom-in duration-300" /> Saved
              </>
            ) : isSaving ? (
              <>
                <div className="h-3.5 w-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Save
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-7 text-xs"
            onClick={() => { setSaveAsName(name + ' (copy)'); setShowSaveAs(true); }}
          >
            <Copy className="h-3.5 w-3.5" /> Save As
          </Button>

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          <div className="relative" ref={loadRef}>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 h-7 text-xs"
              onClick={() => setShowLoad(!showLoad)}
            >
              <FolderOpen className="h-3.5 w-3.5" /> Open
              <ChevronDown className="h-3 w-3" />
            </Button>

            {showLoad && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-card border rounded-lg shadow-xl z-40 py-1 max-h-64 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Saved Workflows
                </div>
                {saved.map((w: any) => (
                  <button
                    key={w.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2 ${w.id === workflowId ? 'bg-accent/50' : ''}`}
                    onClick={() => onLoad(w.id)}
                  >
                    <span className="truncate">{w.name}</span>
                    {w.id === workflowId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                ))}
                {!saved.length && (
                  <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                    No saved workflows yet
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          <div className="relative" ref={templatesRef}>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 h-7 text-xs"
              onClick={() => setShowTemplates(!showTemplates)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" /> Templates
              <ChevronDown className="h-3 w-3" />
            </Button>

            {showTemplates && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-card border rounded-lg shadow-xl z-40 py-1 max-h-64 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Workflow Templates
                </div>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2"
                    onClick={async () => { await onLoadTemplate(t.id); setShowTemplates(false); }}
                  >
                    <span className="truncate">{t.name}</span>
                    <Badge variant="outline" className="text-[9px] shrink-0">{t.nodeCount} nodes</Badge>
                  </button>
                ))}
                {!templates.length && (
                  <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                    No templates available
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator orientation="vertical" className="h-5 mx-0.5" />

          <Button
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={onRun}
            disabled={!workflowId}
          >
            <Play className="h-3.5 w-3.5" /> Run
          </Button>
        </div>
      </div>

      <Dialog open={showSaveAs} onOpenChange={setShowSaveAs}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Workflow As</DialogTitle>
            <DialogDescription>Create a new copy of this workflow with a different name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Workflow Name</span>
              <Input
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                placeholder="My workflow"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAs(); }}
                autoFocus
              />
            </label>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowSaveAs(false)}>Cancel</Button>
              <Button onClick={handleSaveAs} disabled={!saveAsName.trim()} className="gap-1.5">
                <Copy className="h-4 w-4" /> Save Copy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

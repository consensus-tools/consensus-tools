import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Clock, Shield, Users, Zap, Info, Copy, Check, ChevronUp, ChevronDown, Gavel, Gauge, CircleCheckBig, Trash2, Filter, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { getEvents, getRunIds, clearEvents } from '../../lib/api';
import { cn } from '../../lib/utils';

const EVENT_ICONS: Record<string, React.ElementType> = {
  GUARD_EVALUATED: Shield,
  FINAL_DECISION: Zap,
  HUMAN_DECISION: Users,
  WORKFLOW_STARTED: Zap,
  WORKFLOW_STEP: Clock,
  AGENT_VERDICT: Gavel,
  RISK_SCORE: Gauge,
  CONSENSUS_QUORUM: CircleCheckBig,
};

const EVENT_COLORS: Record<string, string> = {
  GUARD_EVALUATED: 'text-emerald-500',
  FINAL_DECISION: 'text-emerald-500',
  HUMAN_DECISION: 'text-emerald-500',
  WORKFLOW_STARTED: 'text-emerald-500',
  WORKFLOW_STEP: 'text-emerald-500',
  AGENT_VERDICT: 'text-amber-400',
  RISK_SCORE: 'text-sky-400',
  CONSENSUS_QUORUM: 'text-violet-400',
};

export function EventTimeline() {
  const [events, setEvents] = useState<any[]>([]);
  const [widths, setWidths] = useState({ step: 40, time: 130, run: 80, type: 110, duration: 70, status: 100 });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [hoveredEvent, setHoveredEvent] = useState<{ id: string; x: number; y: number; position: 'top' | 'bottom' } | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isMouseInTooltip, setIsMouseInTooltip] = useState(false);
  const hideTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [runIdFilter, setRunIdFilter] = useState<string>('');
  const [availableRunIds, setAvailableRunIds] = useState<string[]>([]);
  const [showRunFilter, setShowRunFilter] = useState(false);

  const handleInfoMouseEnter = (e: React.MouseEvent, eventId: string) => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipRect(rect);
    const spaceAbove = rect.top;
    const tooltipHeight = 400; // Estimated max height
    const position = spaceAbove > tooltipHeight ? 'top' : 'bottom';
    setHoveredEvent({ id: eventId, x: 0, y: 0, position });
  };

  const handleMouseDown = (e: React.MouseEvent, column: keyof typeof widths) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = widths[column];
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(50, startWidth + (moveEvent.pageX - startX));
      setWidths(prev => ({ ...prev, [column]: newWidth }));
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ms = (date.getMilliseconds() / 10).toFixed(0).padStart(2, '0');
    return `${month} ${day} ${hours}:${minutes}:${seconds}.${ms}`;
  };

  const getRelativeTime = (ts: number) => {
    const diff = Date.now() - ts;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? '' : 's'} ago`;
  };

  const getTimeTooltip = (ts: number) => {
    const date = new Date(ts);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const local = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true });
    const utc = date.toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true });
    return `${tz}\t${local}\nUTC\t${utc}\nRelative\t${getRelativeTime(ts)}`;
  };
  useEffect(() => {
    async function load() {
      try {
        const params: Record<string, string | number | undefined> = { limit: 50 };
        if (runIdFilter) params.runId = runIdFilter;
        const d = await getEvents(params);
        const sortedEvents = (d.events || []).sort((a: any, b: any) => {
          return sortOrder === 'asc' ? a.seq - b.seq : b.seq - a.seq;
        });
        setEvents(sortedEvents);
      } catch {}
    }
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [sortOrder, runIdFilter]);

  useEffect(() => {
    getRunIds().then(d => setAvailableRunIds(d.runIds || [])).catch(() => {});
    const t = setInterval(() => {
      getRunIds().then(d => setAvailableRunIds(d.runIds || [])).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, []);

  const handleClear = async () => {
    const params: Record<string, string | undefined> = {};
    if (runIdFilter) params.runId = runIdFilter;
    await clearEvents(params);
    setEvents([]);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> Event Log
            {runIdFilter && (
              <Badge variant="outline" className="text-[9px] font-mono gap-1 px-1.5 py-0 h-5 border-emerald-500/30 text-emerald-500">
                {runIdFilter.slice(0, 8)}
                <X className="h-2.5 w-2.5 cursor-pointer hover:text-red-400 transition-colors" onClick={() => setRunIdFilter('')} />
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-accent/50"
                onClick={() => setShowRunFilter(!showRunFilter)}
                title="Filter by Run ID"
              >
                <Filter className={cn("h-3 w-3", runIdFilter ? "text-emerald-500" : "text-muted-foreground")} />
              </Button>
              {showRunFilter && (
                <div className="absolute right-0 top-7 z-50 bg-popover border border-border rounded-md shadow-lg p-2 w-56 max-h-48 overflow-y-auto scrollbar-custom">
                  <div
                    className={cn("px-2 py-1 text-[10px] rounded cursor-pointer hover:bg-accent/50 transition-colors", !runIdFilter && "text-emerald-500 font-medium")}
                    onClick={() => { setRunIdFilter(''); setShowRunFilter(false); }}
                  >
                    All runs
                  </div>
                  {availableRunIds.map(rid => (
                    <div
                      key={rid}
                      className={cn("px-2 py-1 text-[10px] font-mono rounded cursor-pointer hover:bg-accent/50 transition-colors truncate", runIdFilter === rid && "text-emerald-500 font-medium")}
                      onClick={() => { setRunIdFilter(rid); setShowRunFilter(false); }}
                      title={rid}
                    >
                      {rid.slice(0, 12)}…
                    </div>
                  ))}
                  {availableRunIds.length === 0 && (
                    <div className="px-2 py-1 text-[10px] text-muted-foreground">No runs found</div>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-red-500/10 hover:text-red-400"
              onClick={handleClear}
              title={runIdFilter ? `Clear events for run ${runIdFilter.slice(0, 8)}` : 'Clear all events'}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto scrollbar-custom">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-muted/50 backdrop-blur-sm sticky top-0 z-10 border-b border-border/50">
                <th style={{ width: widths.step }} className="py-1.5 px-2 text-[10px] font-medium text-muted-foreground border-r border-border/20 relative group/header select-none cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                  <div className="flex items-center gap-1">
                    #
                    {sortOrder === 'asc' ? <ChevronUp className="h-3 w-3 text-emerald-500" /> : <ChevronDown className="h-3 w-3 text-emerald-500" />}
                  </div>
                  <div 
                    onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'step'); }}
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-20" 
                  />
                </th>
                <th style={{ width: widths.time }} className="py-1.5 px-2 text-[10px] font-medium text-muted-foreground border-r border-border/20 relative group/header">
                  Time
                  <div 
                    onMouseDown={(e) => handleMouseDown(e, 'time')}
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-20" 
                  />
                </th>
                <th style={{ width: widths.run }} className="py-1.5 px-2 text-[10px] font-medium text-muted-foreground border-r border-border/20 relative group/header">
                  Run
                  <div 
                    onMouseDown={(e) => handleMouseDown(e, 'run')}
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-20" 
                  />
                </th>
                <th style={{ width: widths.type }} className="py-1.5 px-2 text-[10px] font-medium text-muted-foreground border-r border-border/20 relative group/header">
                  Type
                  <div 
                    onMouseDown={(e) => handleMouseDown(e, 'type')}
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-20" 
                  />
                </th>
                <th style={{ width: widths.duration }} className="py-1.5 px-2 text-[10px] font-medium text-muted-foreground border-r border-border/20 relative group/header">
                  Duration
                  <div 
                    onMouseDown={(e) => handleMouseDown(e, 'duration')}
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-20" 
                  />
                </th>
                <th style={{ width: widths.status }} className="py-1.5 px-2 text-[10px] font-medium text-muted-foreground border-r border-border/20 relative group/header">
                  Status
                  <div 
                    onMouseDown={(e) => handleMouseDown(e, 'status')}
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-20" 
                  />
                </th>
                <th className="py-1.5 px-2 text-[10px] font-medium text-muted-foreground">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {events.map((event: any) => {
                let payload: any = {};
                try { payload = event.payload_json ? JSON.parse(event.payload_json) : {}; } catch {}
                
                const summary = payload.step_label || payload.decision || payload.action || 'Completed';
                const guardType = payload.guard_type || payload.guardType || '';
                const guardConfigKeys = payload.guard_config ? Object.keys(payload.guard_config).length : (payload.guardConfig ? Object.keys(payload.guardConfig).length : 0);
                const fullInfo = JSON.stringify(payload, null, 2);
                const Icon = EVENT_ICONS[event.type] || Clock;
                const color = EVENT_COLORS[event.type] || 'text-muted-foreground';
                
                const duration = payload.duration_ms ? `${(payload.duration_ms / 1000).toFixed(2)}s` : '-';

                return (
                  <tr key={event.id} className="group hover:bg-accent/30 transition-colors border-b border-border/10 last:border-0">
                    <td className="py-1.5 px-2 text-[10px] text-muted-foreground whitespace-nowrap align-top font-mono border-r border-border/5 text-center">
                      {event.seq ?? '-'}
                    </td>
                    <td className="py-1.5 px-2 text-[10px] text-muted-foreground whitespace-nowrap align-top font-mono border-r border-border/5 group/time relative">
                      <span className="cursor-help" title={getTimeTooltip(event.ts)}>
                        {formatTime(event.ts)}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 align-top border-r border-border/5">
                      <span
                        className={cn("text-[10px] font-mono truncate block", event.run_id ? "text-muted-foreground cursor-pointer hover:text-emerald-400 transition-colors" : "text-muted-foreground")}
                        title={event.run_id ? `Click to filter: ${event.run_id}` : ''}
                        onClick={() => { if (event.run_id) setRunIdFilter(event.run_id); }}
                      >
                        {event.run_id ? event.run_id.slice(0, 8) : '-'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 align-top border-r border-border/5">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <Icon className={`h-3 w-3 shrink-0 ${color}`} />
                        <span className="text-[10px] font-medium truncate uppercase tracking-tight opacity-80">{event.type.replace('WORKFLOW_', '').replace('_EVALUATED', '')}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 align-top border-r border-border/5">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {duration}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 align-top border-r border-border/5">
                      <div className="flex items-center gap-1 overflow-hidden">
                        <span className="text-[10px] text-foreground/90 truncate font-medium">{summary}</span>
                        {guardType && (
                          <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1 py-0.5 rounded font-mono whitespace-nowrap" title={guardConfigKeys > 0 ? `${guardConfigKeys} guard-specific setting(s) configured` : ''}>
                            {guardType.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td 
                      className="py-1.5 px-2 align-top relative group/cell text-center"
                    >
                      <div className="inline-flex items-center justify-center">
                         <div className="relative">
                           <Info 
                             className="h-3.5 w-3.5 text-emerald-500/80 cursor-help hover:text-emerald-400 transition-colors" 
                             onMouseEnter={(e) => handleInfoMouseEnter(e, event.id)}
                             onMouseLeave={() => {
                               hideTimeoutRef.current = setTimeout(() => {
                                 if (!isMouseInTooltip) {
                                   setHoveredEvent(null);
                                 }
                               }, 500);
                             }}
                           />
                           
                           {/* Tooltip removed from here and moved to fixed portal-like container at the bottom */}
                         </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!events.length && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[10px] text-muted-foreground">
                    No events recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* Global Portal-like Tooltip */}
      {hoveredEvent && tooltipRect && (
        <div 
          className={cn(
            "fixed z-[99999] bg-[#030712] text-popover-foreground border border-border shadow-2xl rounded-md p-3 w-80 break-words pointer-events-auto text-[10px] font-mono whitespace-pre-wrap max-h-[60vh] overflow-auto scrollbar-custom shadow-emerald-500/10 text-left",
            hoveredEvent.position === 'top' ? "mb-2" : "mt-2"
          )}
          style={{
            left: Math.max(10, tooltipRect.left - 325),
            top: hoveredEvent.position === 'top' 
              ? tooltipRect.top
              : tooltipRect.bottom,
            transform: hoveredEvent.position === 'top' ? 'translateY(-100%)' : 'none'
          }}
          onMouseEnter={() => {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            setIsMouseInTooltip(true);
          }}
          onMouseLeave={() => {
            setIsMouseInTooltip(false);
            hideTimeoutRef.current = setTimeout(() => {
              setHoveredEvent(null);
            }, 500);
          }}
        >
          {hoveredEvent.position === 'top' ? (
            <>
              <div 
                className="absolute -right-2 bottom-2 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[8px] border-l-border/50" 
              />
              <div 
                className="absolute -right-[7px] bottom-2 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[8px] border-l-[#030712]" 
              />
            </>
          ) : (
            <>
              <div className="absolute -right-2 top-2 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[8px] border-l-border/50" />
              <div className="absolute -right-[7px] top-2 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[8px] border-l-[#030712]" />
            </>
          )}
          
          <div className="font-bold border-b border-border mb-2 pb-1 text-emerald-500 flex items-center justify-between sticky top-0 bg-[#030712] z-10">
            <div className="flex items-center gap-2">
              <Info className="h-3 w-3" /> Raw Event Data
            </div>
            {(() => {
              const event = events.find(e => e.id === hoveredEvent.id);
              if (!event) return null;
              let payload = {};
              try { payload = event.payload_json ? JSON.parse(event.payload_json) : {}; } catch {}
              const fullInfo = JSON.stringify({ seq: event.seq, run_id: event.run_id, ts: event.ts, type: event.type, ...payload }, null, 2);
              
              return (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-14 gap-1 px-1.5 text-[9px] hover:bg-emerald-500/10 text-emerald-500/80 hover:text-emerald-400 transition-all border border-emerald-500/20"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await navigator.clipboard.writeText(fullInfo);
                    setCopiedId(event.id);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                >
                  {copiedId === event.id ? (
                    <>
                      <Check className="h-2.5 w-2.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-2.5 w-2.5" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              );
            })()}
          </div>
          {(() => {
            const event = events.find(e => e.id === hoveredEvent.id);
            if (!event) return null;
            let payload = {};
            try { payload = event.payload_json ? JSON.parse(event.payload_json) : {}; } catch {}
            return JSON.stringify({ seq: event.seq, ts: event.ts, run_id: event.run_id || null, type: event.type, ...payload }, null, 2);
          })()}
        </div>
      )}
    </Card>
  );
}

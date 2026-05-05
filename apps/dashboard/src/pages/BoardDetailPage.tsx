import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Clock, ChevronDown, ChevronUp, Users, ArrowRight, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { getBoard, getEvents, listParticipants } from '../lib/api';
import { JsonBlock } from '../components/JsonPanel';
import { safeParseJSON } from '../lib/safeJson';

const DECISION_COLORS: Record<string, string> = {
  ALLOW: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  BLOCK: 'text-red-400 border-red-500/30 bg-red-500/10',
  REWRITE: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  REQUIRE_HUMAN: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
};

const STATUS_ICON: Record<string, React.ElementType> = {
  completed: CheckCircle,
  waiting: Clock,
  failed: XCircle,
  running: Loader2,
  pending: Clock,
  cancelled: XCircle,
};

const STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-400',
  waiting: 'text-amber-400',
  failed: 'text-destructive',
  running: 'text-sky-400',
  pending: 'text-muted-foreground',
  cancelled: 'text-muted-foreground',
};

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function BoardDetailPage() {
  const { boardId = '' } = useParams();
  const [board, setBoard] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const load = async () => {
    setApiError(null);
    try { const b = await getBoard(boardId); setBoard(b.board); setRuns(b.runs || []); } catch (e: any) { setApiError(e?.message || 'API error'); }
    try { const e = await getEvents({ boardId, limit: 200 }); setEvents(e.events || []); } catch (e: any) { setApiError(e?.message || 'API error'); }
    try { const p = await listParticipants(boardId); setParticipants(p.participants || []); } catch (e: any) { setApiError(e?.message || 'API error'); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [boardId]);

  // Extract final decision info per run from FINAL_DECISION events
  const runDecisions = useMemo(() => {
    const map: Record<string, any> = {};
    for (const e of events) {
      if (e.type === 'FINAL_DECISION' && e.run_id) {
        // Match old behavior: empty payload -> {} so the run row still appears (rendered with dashes via optional chaining downstream).
        map[e.run_id] = safeParseJSON<any>(e.payload_json, {}, 'BoardDetailPage.runDecisions');
      }
    }
    return map;
  }, [events]);

  // Count AGENT_VERDICT events per run
  const voteCountsByRun = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      if (e.type === 'AGENT_VERDICT' && e.run_id) {
        map[e.run_id] = (map[e.run_id] || 0) + 1;
      }
    }
    return map;
  }, [events]);

  const selectedRunEvents = useMemo(() => {
    if (!selectedRunId) return [];
    return events.filter((e: any) => e.run_id === selectedRunId);
  }, [events, selectedRunId]);

  return (
    <div className="mx-auto max-w-screen-xl p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/boards">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Boards
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">{board?.name || boardId}</h1>
        <Badge variant="secondary" className="text-[10px]">{boardId}</Badge>
      </div>

      {apiError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          API error: {apiError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Runs ({runs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {!runs.length && (
                <p className="text-sm text-muted-foreground py-4 text-center">No runs for this board.</p>
              )}
              {runs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border/50">
                        <th className="pb-2 pr-2 font-medium">Status</th>
                        <th className="pb-2 pr-2 font-medium">Run ID</th>
                        <th className="pb-2 pr-2 font-medium">Result</th>
                        <th className="pb-2 pr-2 font-medium">Guard</th>
                        <th className="pb-2 pr-2 font-medium text-right">Risk</th>
                        <th className="pb-2 pr-2 font-medium text-right">Votes</th>
                        <th className="pb-2 pr-2 font-medium">Started</th>
                        <th className="pb-2 font-medium text-right">Duration</th>
                        <th className="pb-2 w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r: any) => {
                        const decision = runDecisions[r.id];
                        const voteCount = voteCountsByRun[r.id] || 0;
                        const StatusIcon = STATUS_ICON[r.status] || Clock;
                        const statusColor = STATUS_COLOR[r.status] || 'text-muted-foreground';
                        const isSelected = selectedRunId === r.id;
                        return (
                          <tr
                            key={r.id}
                            className={`border-b border-border/30 hover:bg-accent/20 transition-colors group cursor-pointer ${isSelected ? 'bg-accent/30' : ''}`}
                            onClick={() => { setSelectedRunId(isSelected ? null : r.id); setExpandedEvent(null); }}
                          >
                            <td className="py-2 pr-2">
                              <div className="flex items-center gap-1.5">
                                <StatusIcon className={`h-3.5 w-3.5 ${statusColor}`} />
                                <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                              </div>
                            </td>
                            <td className="py-2 pr-2">
                              <Link to={`/boards/run/${r.id}`} className="text-primary hover:underline font-mono truncate block max-w-[140px]">
                                {r.id.slice(0, 16)}
                              </Link>
                            </td>
                            <td className="py-2 pr-2">
                              {decision?.decision ? (
                                <Badge className={`text-[10px] ${DECISION_COLORS[decision.decision] || ''}`}>
                                  {decision.decision}
                                </Badge>
                              ) : r.result ? (
                                <span className="text-muted-foreground">{r.result}</span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-2">
                              {decision?.guard_type ? (
                                <Badge variant="outline" className="text-[10px]">{decision.guard_type}</Badge>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-2 text-right">
                              {decision?.risk_score != null ? (
                                <span>{(decision.risk_score * 100).toFixed(0)}%</span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-2 text-right">
                              {voteCount > 0 ? (
                                <span>{voteCount}</span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-2 text-muted-foreground">
                              {formatTimestamp(r.started_at)}
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {formatDuration(r.duration_ms)}
                            </td>
                            <td className="py-2 pl-1">
                              <Link to={`/boards/run/${r.id}`}>
                                <ArrowRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedRunId && (
                <div className="mt-4 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Events for {selectedRunId.slice(0, 16)}</span>
                    <Badge variant="secondary" className="text-[10px]">{selectedRunEvents.length}</Badge>
                  </div>
                  {!selectedRunEvents.length ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">No events for this run.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b border-border/50">
                            <th className="pb-2 pr-2 font-medium w-8">#</th>
                            <th className="pb-2 pr-2 font-medium">Type</th>
                            <th className="pb-2 font-medium">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRunEvents.map((e: any, i: number) => {
                            const isExpanded = expandedEvent === e.id;
                            return (
                              <React.Fragment key={e.id}>
                                <tr
                                  className="border-b border-border/30 hover:bg-accent/20 transition-colors cursor-pointer"
                                  onClick={(ev) => { ev.stopPropagation(); setExpandedEvent(isExpanded ? null : e.id); }}
                                >
                                  <td className="py-1.5 pr-2 text-muted-foreground/50">{i + 1}</td>
                                  <td className="py-1.5 pr-2">
                                    <Badge variant="outline" className="text-[10px]">{e.type}</Badge>
                                  </td>
                                  <td className="py-1.5 text-muted-foreground">
                                    {new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={3} className="pb-2 pt-0">
                                      <JsonBlock raw={e.payload_json} />
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5" /> Participants ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!participants.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No participants yet.</p>
            ) : (
              <div className="space-y-2">
                {participants.map((p: any) => (
                  <div key={p.id} className="py-2 px-3 rounded-md border border-border/50 hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{p.subject_id}</span>
                      <Badge variant="outline" className="text-[10px]">{p.subject_type}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span>weight: {Number(p.weight).toFixed(2)}</span>
                      <span>rep: {Number(p.reputation).toFixed(1)}</span>
                      <span className={p.status === 'active' ? 'text-emerald-400' : 'text-red-400'}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Raw Board Data</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showRaw ? 'Hide' : 'Show'}
            </Button>
          </div>
        </CardHeader>
        {showRaw && (
          <CardContent>
            <JsonBlock value={board} maxHeight="max-h-80" />
          </CardContent>
        )}
      </Card>
    </div>
  );
}

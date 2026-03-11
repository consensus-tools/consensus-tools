import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Clock, ChevronDown, ChevronUp, Users, ArrowRight } from 'lucide-react';
import { getBoard, getEvents, listParticipants } from '../lib/api';

const DECISION_COLORS: Record<string, string> = {
  ALLOW: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  BLOCK: 'text-red-400 border-red-500/30 bg-red-500/10',
  REWRITE: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  REQUIRE_HUMAN: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
};

export default function BoardDetailPage() {
  const { boardId = '' } = useParams();
  const [board, setBoard] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [showRaw, setShowRaw] = useState(false);

  const load = async () => {
    try {
      const b = await getBoard(boardId);
      setBoard(b.board);
      setRuns(b.runs || []);
      const e = await getEvents({ boardId, limit: 200 });
      setEvents(e.events || []);
    } catch {}
    try {
      const p = await listParticipants(boardId);
      setParticipants(p.participants || []);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [boardId]);

  const runDecisions = useMemo(() => {
    const map: Record<string, any> = {};
    for (const e of events) {
      if (e.type === 'FINAL_DECISION' && e.run_id) {
        try {
          const payload = JSON.parse(e.payload_json || '{}');
          map[e.run_id] = payload;
        } catch {}
      }
    }
    return map;
  }, [events]);

  const voteCountsByRun = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      if (e.type === 'EVALUATOR_VOTE' && e.run_id) {
        map[e.run_id] = (map[e.run_id] || 0) + 1;
      }
    }
    return map;
  }, [events]);

  const runConsensusMeta = useMemo(() => {
    const map: Record<string, any> = {};
    for (const e of events) {
      if (e.type === 'FINAL_DECISION' && e.run_id) {
        try {
          const payload = JSON.parse(e.payload_json || '{}');
          map[e.run_id] = {
            jobId: payload?.audit_id || payload?.consensus_meta?.jobId || null,
            submissionId: payload?.consensus_meta?.submissionId || null,
            guardType: payload?.guard_type || null,
          };
        } catch {}
      }
    }
    return map;
  }, [events]);

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
              <div className="space-y-2">
                {runs.map((r: any) => {
                  const decision = runDecisions[r.id];
                  const voteCount = voteCountsByRun[r.id] || 0;
                  const meta = runConsensusMeta[r.id] || null;
                  return (
                    <Link key={r.id} to={`/boards/run/${r.id}`} className="block">
                      <div className="flex items-center gap-2 py-2.5 px-3 rounded-md border border-border/50 hover:bg-accent/30 hover:border-primary/30 transition-colors">
                        <Badge variant="outline" className="text-[10px] shrink-0">{r.status}</Badge>
                        {decision && (
                          <Badge className={`text-[10px] shrink-0 ${DECISION_COLORS[decision.decision] || ''}`}>
                            {decision.decision}
                          </Badge>
                        )}
                        <span className="text-sm truncate flex-1">{r.id}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {meta?.jobId && (
                            <Badge variant="secondary" className="text-[10px] max-w-[160px] truncate" title={meta.jobId}>
                              job: {meta.jobId}
                            </Badge>
                          )}
                          {meta?.guardType && (
                            <Badge variant="outline" className="text-[10px]">{meta.guardType}</Badge>
                          )}
                          {decision?.risk_score != null && (
                            <span className="text-[10px] text-muted-foreground">
                              risk: {Number(decision.risk_score).toFixed(2)}
                            </span>
                          )}
                          {voteCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {voteCount} vote{voteCount !== 1 ? 's' : ''}
                            </span>
                          )}
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
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
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> Event Timeline ({events.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!events.length && (
            <p className="text-sm text-muted-foreground py-4 text-center">No events yet.</p>
          )}
          <div className="space-y-1">
            {events.map((e: any) => (
              <div key={e.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent/30 transition-colors">
                <Badge variant="outline" className="text-[10px] shrink-0">{e.type}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
                {e.run_id && (
                  <Link to={`/boards/run/${e.run_id}`} className="text-[10px] text-primary hover:underline truncate">
                    {e.run_id}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
            <pre className="text-xs bg-background/50 border rounded-md p-3 overflow-auto max-h-80">{JSON.stringify(board, null, 2)}</pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

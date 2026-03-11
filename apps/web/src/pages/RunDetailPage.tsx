import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Copy, Clock, Shield, ChevronDown, ChevronUp, Vote, Users, TrendingUp, TrendingDown, Link as LinkIcon } from 'lucide-react';
import { getRun, getVotes } from '../lib/api';

const DECISION_COLORS: Record<string, string> = {
  ALLOW: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  BLOCK: 'bg-red-500/10 text-red-400 border-red-500/30',
  REWRITE: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  REQUIRE_HUMAN: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

const VOTE_COLORS: Record<string, string> = {
  YES: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  NO: 'bg-red-500/15 text-red-400 border-red-500/30',
  REWRITE: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

export default function RunDetailPage() {
  const { runId = '' } = useParams();
  const [run, setRun] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [voteData, setVoteData] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  const load = async () => {
    try {
      const d = await getRun(runId);
      setRun(d.run);
      setEvents(d.events || []);
    } catch {}
    try {
      const v = await getVotes(runId);
      setVoteData(v);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [runId]);

  const final = useMemo(() => events.find((e: any) => e.type === 'FINAL_DECISION'), [events]);
  const parsed = final ? (() => { try { return JSON.parse(final.payload_json || '{}'); } catch { return null; } })() : null;
  const consensusMeta = parsed?.consensus_meta || parsed?.meta || null;
  const consensusJobId = parsed?.audit_id || consensusMeta?.jobId || null;
  const consensusSubmissionId = consensusMeta?.submissionId || null;

  const correlations = useMemo(() => {
    const rows = events
      .map((e: any) => {
        let p: any = null;
        try { p = e.payload_json ? JSON.parse(e.payload_json) : null; } catch {}
        if (!p || (!p.external_run_id && !p.external_step_id && !p.engine)) return null;
        return { eventId: e.id, type: e.type, engine: p.engine || null, externalRunId: p.external_run_id || null, externalStepId: p.external_step_id || null };
      })
      .filter(Boolean);
    const seen = new Set<string>();
    return rows.filter((r: any) => {
      const key = `${r.type}|${r.engine}|${r.externalRunId}|${r.externalStepId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [events]);

  const votes = voteData?.votes || [];
  const aggregate = voteData?.aggregate || null;
  const participants = voteData?.participants || [];

  return (
    <div className="mx-auto max-w-screen-xl p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/boards">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        </Link>
        <h1 className="text-xl font-semibold truncate">Run {runId}</h1>
        {run && <Badge variant="outline" className="text-[10px]">{run.status}</Badge>}
      </div>

      {parsed && (
        <Card className={`border ${DECISION_COLORS[parsed.decision] || ''}`}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className={DECISION_COLORS[parsed.decision]}>{parsed.decision}</Badge>
              <span className="font-medium">{parsed.reason}</span>
              <span className="text-xs text-muted-foreground">risk: {parsed.risk_score}</span>
              <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs ml-auto" onClick={() => final?.id && navigator.clipboard.writeText(final.id)}>
                <Copy className="h-3 w-3" /> Copy audit_id
              </Button>
            </div>

            {(consensusJobId || consensusSubmissionId || parsed?.guard_type) && (
              <div className="rounded-md border border-border/50 bg-background/40 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <LinkIcon className="h-3 w-3 text-primary" /> Consensus Metadata
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  <div className="rounded border border-border/40 px-2 py-1.5">
                    <div className="text-muted-foreground">Consensus Job</div>
                    <div className="font-mono truncate">{consensusJobId || '—'}</div>
                  </div>
                  <div className="rounded border border-border/40 px-2 py-1.5">
                    <div className="text-muted-foreground">Submission</div>
                    <div className="font-mono truncate">{consensusSubmissionId || '—'}</div>
                  </div>
                  <div className="rounded border border-border/40 px-2 py-1.5">
                    <div className="text-muted-foreground">Guard Type</div>
                    <div className="truncate">{parsed?.guard_type || '—'}</div>
                  </div>
                </div>
              </div>
            )}

            {parsed.suggested_rewrite && (
              <pre className="mt-3 text-xs bg-background/50 border rounded-md p-3 overflow-auto">{JSON.stringify(parsed.suggested_rewrite, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-3.5 w-3.5" /> Votes ({votes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!votes.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No votes recorded for this run.</p>
            ) : (
              <div className="space-y-2">
                {votes.map((v: any) => (
                  <div key={v.id} className={`rounded-md border p-3 space-y-1.5 ${VOTE_COLORS[v.decision] || 'border-border/50'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={VOTE_COLORS[v.decision]}>{v.decision}</Badge>
                      <span className="text-sm font-medium">{v.participant?.subject_id || v.participant_id}</span>
                      {v.participant?.subject_type && (
                        <Badge variant="outline" className="text-[10px]">{v.participant.subject_type}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        confidence: {(v.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{v.rationale}</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70">
                      <span>weight: {Number(v.weight_snapshot).toFixed(2)}</span>
                      <span>reputation: {Number(v.reputation_snapshot).toFixed(1)}</span>
                      {v.participant && Number(v.participant.reputation) !== Number(v.reputation_snapshot) && (
                        <span className="flex items-center gap-0.5">
                          {Number(v.participant.reputation) > Number(v.reputation_snapshot) ? (
                            <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />
                          ) : (
                            <TrendingDown className="h-2.5 w-2.5 text-red-400" />
                          )}
                          now: {Number(v.participant.reputation).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {aggregate && votes.length > 0 && (
              <div className="mt-4 pt-3 border-t space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Vote Summary</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between px-2 py-1 rounded bg-accent/20">
                    <span className="text-muted-foreground">Total Weight</span>
                    <span>{Number(aggregate.totalWeight).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between px-2 py-1 rounded bg-accent/20">
                    <span className="text-muted-foreground">YES Weight</span>
                    <span className="text-emerald-400">{Number(aggregate.yesWeight).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between px-2 py-1 rounded bg-accent/20">
                    <span className="text-muted-foreground">Approval Ratio</span>
                    <span>{(aggregate.ratio * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between px-2 py-1 rounded bg-accent/20">
                    <span className="text-muted-foreground">Quorum ({(aggregate.quorum * 100).toFixed(0)}%)</span>
                    <Badge variant="outline" className={`text-[10px] ${aggregate.passed ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'}`}>
                      {aggregate.passed ? 'Passed' : 'Not Met'}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5" /> Participants ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!participants.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No participants registered for this board.</p>
            ) : (
              <div className="space-y-2">
                {participants.map((p: any) => {
                  const vote = votes.find((v: any) => v.participant_id === p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-2 py-2 px-3 rounded-md border border-border/50 hover:bg-accent/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{p.subject_id}</span>
                          <Badge variant="outline" className="text-[10px]">{p.subject_type}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{p.role || 'voter'}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span>weight: {Number(p.weight).toFixed(2)}</span>
                          <span>reputation: {Number(p.reputation).toFixed(1)}</span>
                          <span className={`${p.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>{p.status}</span>
                        </div>
                      </div>
                      {vote && (
                        <Badge className={`text-[10px] ${VOTE_COLORS[vote.decision] || ''}`}>
                          {vote.decision}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {correlations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5" /> Correlation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {correlations.map((c: any) => (
                <div key={`${c.eventId}-${c.externalStepId || 'none'}`} className="flex items-center gap-2 py-1.5">
                  <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
                  {c.engine && <Badge variant="secondary" className="text-[10px]">{c.engine}</Badge>}
                  {c.externalRunId && <span className="text-xs text-muted-foreground">run: {c.externalRunId}</span>}
                  {c.externalStepId && <span className="text-xs text-muted-foreground">step: {c.externalStepId}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> Decision Trace ({events.length})
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={() => setShowTrace(!showTrace)}>
              {showTrace ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showTrace ? 'Hide' : 'Show'}
            </Button>
          </div>
        </CardHeader>
        {showTrace && (
          <CardContent>
            <div className="space-y-2">
              {events.map((e: any) => (
                <div key={e.id} className="rounded-md border border-border/50 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{e.type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground/50 truncate">{e.id}</span>
                  </div>
                  <pre className="text-xs bg-background/50 border rounded p-2 overflow-auto max-h-40">{e.payload_json}</pre>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Run JSON</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showRaw ? 'Hide' : 'Show'}
            </Button>
          </div>
        </CardHeader>
        {showRaw && (
          <CardContent>
            <pre className="text-xs bg-background/50 border rounded-md p-3 overflow-auto max-h-80">{JSON.stringify(run, null, 2)}</pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

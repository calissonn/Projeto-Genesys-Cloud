'use client';
import { useMemo, useState } from 'react';
import { RISK_LABELS } from '@acc/shared';
import { formatTime } from '@/lib/format';
import { api, useAcc } from '@/lib/store';
import { Badge, Button, Card, Empty } from './ui';

export function Approvals() {
  const approvals = useAcc((s) => s.approvals);
  const agents = useAcc((s) => s.agents);
  const projects = useAcc((s) => s.projects);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useMemo(() => Object.values(approvals).filter((a) => a.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [approvals]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id);
    setError(null);
    try {
      await api(`approvals/${id}`, { decision });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title={<>Fila de aprovação {pending.length > 0 && <Badge tone="warn">{pending.length}</Badge>}</>}>
      {error && <p className="mb-2 text-sm text-rose-300">{error}</p>}
      {pending.length === 0 ? (
        <Empty>Nada aguardando sua decisão.</Empty>
      ) : (
        <ul className="space-y-3" data-testid="approvals">
          {pending.map((a) => (
            <li key={a.id} className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warn">{RISK_LABELS[a.category]}</Badge>
                <span className="text-xs text-slate-400">
                  {agents[a.agentId]?.name} · {projects[a.projectId]?.name} · {formatTime(a.createdAt)}
                </span>
              </div>
              <p className="mt-2 font-medium">{a.title}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-300">{a.detail}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="ok" disabled={busy === a.id} onClick={() => decide(a.id, 'approve')}>
                  Aprovar
                </Button>
                <Button variant="danger" disabled={busy === a.id} onClick={() => decide(a.id, 'reject')}>
                  Rejeitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

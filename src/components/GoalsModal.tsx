import { useState } from 'react';
import { DEFAULT_GOALS, useApp } from '../context/AppContext';
import type { Goals } from '../data/types';
import { Field, Modal } from './ui';

const FIELDS: { k: keyof Goals; label: string; hint: string }[] = [
  { k: 'disconnectWarn', label: 'Desligamento — atenção a partir de (%)', hint: 'Taxa de desligamento na URA' },
  { k: 'disconnectCrit', label: 'Desligamento — crítico a partir de (%)', hint: 'Deve ser maior que o limite de atenção' },
  { k: 'stepDisconnectWarn', label: 'Desligamento por etapa — atenção (%)', hint: 'Usado no mapa e na análise por etapa' },
  { k: 'stepDisconnectCrit', label: 'Desligamento por etapa — crítico (%)', hint: '' },
  { k: 'selfServiceTarget', label: 'Meta de autosserviço (%)', hint: 'Mínimo desejado' },
  { k: 'transferMax', label: 'Transferência máxima (%)', hint: '' },
  { k: 'authFailureWarn', label: 'Falha de CPF — atenção (%)', hint: '' },
  { k: 'authFailureCrit', label: 'Falha de CPF — crítico (%)', hint: '' },
];

/** Edição das metas usadas na classificação crítica (persistidas e auditadas). */
export function GoalsModal({ onClose }: { onClose: () => void }) {
  const { goals, setGoals } = useApp();
  const [g, setG] = useState<Goals>(goals);
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    if (Object.values(g).some((v) => !(v >= 0 && v <= 100))) return setErr('Use valores entre 0 e 100.');
    if (g.disconnectCrit <= g.disconnectWarn || g.stepDisconnectCrit <= g.stepDisconnectWarn || g.authFailureCrit <= g.authFailureWarn) return setErr('O limite crítico deve ser maior que o de atenção.');
    setGoals(g);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Metas e classificação crítica"
      footer={<><button className="btn-ghost mr-auto" onClick={() => setG(DEFAULT_GOALS)}>Restaurar padrão</button><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save}>Salvar metas</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.k} label={f.label} hint={f.hint}>
            <input type="number" min={0} max={100} step="0.5" className="input" value={g[f.k]} onChange={(e) => setG({ ...g, [f.k]: Number(e.target.value) })} />
          </Field>
        ))}
      </div>
      {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
      <p className="mt-3 text-xs text-slate-500">As alterações são registradas na auditoria.</p>
    </Modal>
  );
}

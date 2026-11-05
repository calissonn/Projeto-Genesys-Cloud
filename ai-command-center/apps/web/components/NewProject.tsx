'use client';
import { useState } from 'react';
import { api, useAcc } from '@/lib/store';
import { Button, Card } from './ui';

export function NewProject() {
  const mode = useAcc((s) => s.mode);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api('projects', { name, description });
      setName('');
      setDescription('');
      setMessage({ ok: true, text: 'Projeto criado. A coordenadora está montando o plano.' });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Novo projeto">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="text-slate-300">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            maxLength={80}
            className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 outline-none focus:border-teal-400"
            placeholder="Portal de clientes"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-300">Descreva o sistema desejado</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minLength={10}
            maxLength={4000}
            rows={3}
            className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 outline-none focus:border-teal-400"
            placeholder="Portal com login, lista de pedidos e API"
          />
        </label>
        {mode === 'demo' && <p className="text-xs text-slate-400">Dica: inclua “#erro” na descrição para ver o fluxo de erro.</p>}
        {message && <p className={`text-sm ${message.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{message.text}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Enviando…' : 'Criar projeto'}
        </Button>
      </form>
    </Card>
  );
}

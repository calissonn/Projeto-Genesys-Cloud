import clsx from 'clsx';
import {
  AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDot, FlaskConical, Info, Loader2, Minus, RefreshCw, X, XCircle,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import type { OccurrenceStatus, Severity } from '../data/types';
import { STATUS_TEXT } from '../context/AppContext';
import { fmt1 } from '../lib/format';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, info, actions }: { title: ReactNode; subtitle?: ReactNode; info?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {title}
          {info && <InfoTip text={info} />}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <span className={clsx('group relative inline-flex', className)} tabIndex={0} aria-label={text}>
      <Info className="h-3.5 w-3.5 cursor-help text-slate-400 transition group-hover:text-brand-500" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-100 shadow-xl group-hover:block group-focus:block dark:bg-slate-700"
      >
        {text}
      </span>
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SimulatedTag({ className }: { className?: string }) {
  return (
    <span
      title="Os números exibidos são fictícios, gerados para validação do protótipo. Nenhuma integração com a Genesys Cloud está ativa."
      className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300', className)}
    >
      <FlaskConical className="h-3 w-3" /> Dados simulados
    </span>
  );
}

const SEV: Record<Severity, { label: string; cls: string; Icon: typeof Info }> = {
  baixa: { label: 'Baixa', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', Icon: CircleDot },
  media: { label: 'Média', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', Icon: AlertTriangle },
  alta: { label: 'Alta', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300', Icon: AlertTriangle },
  critica: { label: 'Crítica', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300', Icon: AlertOctagon },
};

export function SeverityBadge({ s }: { s: Severity }) {
  const { label, cls, Icon } = SEV[s];
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

const OCC: Record<OccurrenceStatus, string> = {
  aberta: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
  em_analise: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900',
  resolvida: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900',
  descartada: 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
};
export function OccStatusBadge({ s }: { s: OccurrenceStatus }) {
  return <span className={clsx('inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', OCC[s])}>{STATUS_TEXT[s]}</span>;
}

export type Health = 'ok' | 'warn' | 'crit' | 'none';
export function HealthBadge({ h, label }: { h: Health; label?: string }) {
  const map = {
    ok: { cls: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300', Icon: CheckCircle2, t: 'Dentro da meta' },
    warn: { cls: 'text-amber-800 bg-amber-50 dark:bg-amber-950 dark:text-amber-300', Icon: AlertTriangle, t: 'Atenção' },
    crit: { cls: 'text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300', Icon: XCircle, t: 'Crítico' },
    none: { cls: 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400', Icon: Minus, t: 'Sem dados' },
  }[h];
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', map.cls)}>
      <map.Icon className="h-3 w-3" /> {label ?? map.t}
    </span>
  );
}

/** Variação vs período anterior. `higherIsBad` define se aumento é ruim (vermelho) ou bom (verde). */
export function Delta({ value, higherIsBad, unit = '%', suffix = 'vs. anterior' }: { value: number | null; higherIsBad: boolean; unit?: string; suffix?: string }) {
  if (value == null || !isFinite(value)) return <span className="text-xs text-slate-400">Sem base de comparação</span>;
  const flat = Math.abs(value) < 0.5;
  const bad = !flat && (value > 0) === higherIsBad;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 text-xs">
      <span className={clsx('inline-flex items-center gap-0.5 whitespace-nowrap font-semibold', flat ? 'text-slate-500' : bad ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>
        <Icon className="h-3.5 w-3.5" />
        {value > 0 ? '+' : ''}{fmt1(value)}{unit}
      </span>
      {suffix && <span className="whitespace-nowrap text-slate-400">{suffix}</span>}
    </span>
  );
}

export function KpiCard({
  label, value, info, delta, higherIsBad = false, deltaUnit, sub, accent,
}: { label: string; value: string; info: string; delta?: number | null; higherIsBad?: boolean; deltaUnit?: string; sub?: ReactNode; accent?: Health }) {
  return (
    <div className={clsx('card relative overflow-visible p-4', accent === 'crit' && 'ring-1 ring-red-300 dark:ring-red-900', accent === 'warn' && 'ring-1 ring-amber-300 dark:ring-amber-800')}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        {label} <InfoTip text={info} />
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
      <div className="mt-1 min-h-[18px]">{delta !== undefined && <Delta value={delta} higherIsBad={higherIsBad} unit={deltaUnit} />}</div>
      {sub && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

export function LoadingState({ text = 'Carregando dados…' }: { text?: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-sm text-slate-500" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      {text}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card mx-auto my-10 max-w-lg p-6 text-center" role="alert">
      <XCircle className="mx-auto h-8 w-8 text-red-500" />
      <h3 className="mt-2 font-semibold">Não foi possível carregar os dados</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {onRetry && (
        <button className="btn-primary mt-4" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</div>
      {text && <div className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{text}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className={clsx('card my-8 w-full', wide ? 'max-w-3xl' : 'max-w-xl')} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-slate-900" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</div>}
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-md px-2.5 py-1 text-xs font-medium transition', value === o.value ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

/** Legenda de séries — identidade nunca apenas pela cor. */
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dashed ? (
            <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

import type { ReactNode } from 'react';
import type { Tone } from '@/lib/format';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-700/60 text-slate-200 ring-slate-500/40',
  info: 'bg-sky-500/15 text-sky-300 ring-sky-400/40',
  ok: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/40',
  warn: 'bg-amber-500/15 text-amber-300 ring-amber-400/40',
  bad: 'bg-rose-500/15 text-rose-300 ring-rose-400/40',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ok' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-teal-500 text-slate-950 hover:bg-teal-400',
    ok: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
    danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
    ghost: 'bg-transparent text-slate-200 ring-1 ring-inset ring-slate-600 hover:bg-slate-700/40',
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 ${styles} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

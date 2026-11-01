const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtInt = (n: number) => nf.format(Math.round(n));
export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null || !isFinite(n) ? '—' : `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)}%`;
export const fmt1 = (n: number) => nf1.format(n);

export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${nf1.format(n / 1_000_000)} mi`;
  if (Math.abs(n) >= 10_000) return `${nf1.format(n / 1000)} mil`;
  return fmtInt(n);
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}min ${String(r).padStart(2, '0')}s` : `${r}s`;
}

/** Variação percentual entre atual e anterior. */
export function variation(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

export const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

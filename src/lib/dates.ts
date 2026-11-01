/** Utilitários de data (sempre em horário local, formato YYYY-MM-DD). */

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function daysAgo(n: number): string {
  return addDays(todayISO(), -n);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function fmtDate(iso: string, withWeekday = false): string {
  const d = fromISO(iso);
  const base = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return withWeekday ? `${WEEKDAYS[d.getDay()]} ${base}` : base;
}

export function fmtDateLong(iso: string): string {
  return fromISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function weekday(iso: string): number {
  return fromISO(iso).getDay();
}

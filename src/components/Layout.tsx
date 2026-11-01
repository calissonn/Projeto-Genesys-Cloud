import clsx from 'clsx';
import {
  Activity, BarChart3, Bell, Bot, ClipboardCheck, FileBarChart, GitBranch, GitCompare, History, LayoutDashboard, Menu, Moon, PhoneOff, Plug, Settings, ShieldAlert, Sun, X, ListTree,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { FAILURE_METRICS } from '../lib/alertEngine';
import { SimulatedTag } from './ui';

const FAILURE_SET = new Set<string>(FAILURE_METRICS.map((f) => f.metric));

interface NavItem { to: string; label: string; icon: typeof Activity; stage?: number; badge?: number }

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme, occurrences, dataSource } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const openAlerts = occurrences.filter((o) => o.status === 'aberta').length;
  const openFailures = occurrences.filter((o) => o.status === 'aberta' && FAILURE_SET.has(o.metric)).length;

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Monitoramento',
      items: [
        { to: '/', label: 'Dashboard executivo', icon: LayoutDashboard },
        { to: '/uras', label: 'Catálogo de URAs', icon: ListTree },
        { to: '/mapa', label: 'Mapa inteligente', icon: GitBranch },
        { to: '/alertas', label: 'Central de alertas', icon: Bell, badge: openAlerts },
      ],
    },
    {
      title: 'Análise',
      items: [
        { to: '/desligamentos', label: 'Desligamentos', icon: PhoneOff },
        { to: '/falhas', label: 'Monitoramento de falhas', icon: ShieldAlert, badge: openFailures },
        { to: '/comparacao', label: 'Comparação de períodos', icon: GitCompare },
        { to: '/relatorios', label: 'Relatórios', icon: FileBarChart },
        { to: '/ia', label: 'Inteligência CX', icon: Bot, stage: 4 },
      ],
    },
    {
      title: 'Qualidade',
      items: [
        { to: '/testes', label: 'Gestão de testes', icon: ClipboardCheck },
        { to: '/historico', label: 'Histórico e auditoria', icon: History },
      ],
    },
    {
      title: 'Configuração',
      items: [
        { to: '/integracao', label: 'Integração Genesys', icon: Plug },
        { to: '/admin', label: 'Administração', icon: Settings, stage: 3 },
      ],
    },
  ];

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight text-white">Gazin URA</div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-brand-200">Intelligence</div>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-300/70">{g.title}</div>
            <ul className="space-y-0.5">
              {g.items.map((i) => (
                <li key={i.to}>
                  <NavLink
                    to={i.to}
                    end={i.to === '/'}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      clsx('group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition',
                        isActive ? 'bg-white/10 font-medium text-white' : 'text-brand-100/80 hover:bg-white/5 hover:text-white')}
                  >
                    <i.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{i.label}</span>
                    {i.badge ? <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{i.badge}</span> : null}
                    {i.stage ? <span className="rounded bg-white/10 px-1 text-[10px] text-brand-200" title={`Planejado para a Etapa ${i.stage}`}>E{i.stage}</span> : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-brand-200/80">
        Fonte: <span className="font-medium text-white">{dataSource.label}</span>
        <div>Versão 0.2 · Etapa 2</div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand-950 lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/60" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-brand-950" onClick={(e) => e.stopPropagation()}>{nav}</aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:px-6">
          <button className="btn-ghost p-1.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="hidden truncate text-sm text-slate-500 sm:block dark:text-slate-400">Gazin · Central de monitoramento de URAs</div>
          <div className="ml-auto flex items-center gap-2">
            {dataSource.kind === 'simulado' && <SimulatedTag />}
            <button className="btn-ghost p-2" onClick={toggleTheme} aria-label="Alternar modo claro/escuro" title="Alternar modo claro/escuro">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <main key={loc.pathname} className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

import clsx from 'clsx';
import {
  Activity, BarChart3, Bell, Bot, ClipboardCheck, FileBarChart, GitBranch, GitCompare, History, LayoutDashboard, Menu, Moon, PhoneOff, Plug, Settings, ShieldAlert, Sun, UserCircle, X, ListTree,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { Availability } from '../services/dataProvider';
import { useApp } from '../context/AppContext';
import { FAILURE_METRICS } from '../lib/alertEngine';
import { SimulatedTag } from './ui';

const FAILURE_SET = new Set<string>(FAILURE_METRICS.map((f) => f.metric));

interface NavItem { to: string; label: string; icon: typeof Activity; stage?: number; badge?: number }

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme, occurrences, dataSource, user, can, notice, clearNotice, availability } = useApp();
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
        { to: '/ia', label: 'Inteligência CX', icon: Bot },
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
        ...(can('catalog:write') || can('users:manage') || can('integration:read') ? [{ to: '/admin', label: 'Administração', icon: Settings }] : []),
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
        <div>Versão 0.4 · Etapa 4</div>
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
            {user && dataSource.kind !== 'simulado' && (
              <span className="hidden items-center gap-2 text-right text-xs leading-tight sm:flex" title={user.email}>
                <span><span className="block font-medium text-slate-700 dark:text-slate-200">{user.name}</span><span className="text-slate-500">{user.profileLabel}</span></span>
                <UserCircle className="h-6 w-6 text-slate-400" />
              </span>
            )}
            <button className="btn-ghost p-2" onClick={toggleTheme} aria-label="Alternar modo claro/escuro" title="Alternar modo claro/escuro">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        {notice && (
          <div className="mx-auto mt-4 flex max-w-[1500px] items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200 sm:mx-6" role="alert">
            <span className="flex-1">Não foi possível concluir a operação: {notice}</span>
            <button className="btn-ghost p-1" onClick={clearNotice} aria-label="Fechar aviso"><X className="h-4 w-4" /></button>
          </div>
        )}
        {availability && missing(availability).length > 0 && (
          <div className="mx-auto mt-4 max-w-[1500px] rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100 sm:mx-6">
            <b>Indicadores sem instrumentação na Genesys</b> (aparecem zerados ou iguais a outro indicador): {missing(availability).join(' · ')}.{' '}
            {can('integration:read') && <Link to="/admin" className="underline">Configurar instrumentação</Link>}
          </div>
        )}
        <main key={loc.pathname} className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

const AVAIL_LABEL: [keyof Availability, string][] = [
  ['unique', 'conversas únicas (= entradas)'], ['queueAbandons', 'abandono na fila'], ['transfers', 'transferências por destino'],
  ['selfService', 'autosserviço'], ['authentication', 'identificação por CPF'], ['integrationErrors', 'erros de integração'],
  ['apiErrors', 'falhas de API'], ['flowErrors', 'erros de fluxo'], ['invalidOptions', 'opção inválida'], ['transferFailures', 'transferências malsucedidas'],
];
function missing(a: Availability) {
  return AVAIL_LABEL.filter(([k]) => !a[k]).map(([, l]) => l);
}

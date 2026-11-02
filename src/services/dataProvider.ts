/**
 * Camada de acesso a dados do front-end.
 *
 * O front-end NUNCA fala diretamente com a Genesys Cloud. No modo backend ele consome
 * a API do servidor Gazin URA Intelligence (`/api/...`), que autentica na Genesys via
 * OAuth Client Credentials e consulta somente em modo leitura. Ver `server/` e docs/.
 */
import { DEPARTMENTS, URAS } from '../data/catalog';
import { generateRecords } from '../data/mockData';
import type { DataSourceKind, Department, HourRecord, Ura } from '../data/types';
import { addDays, todayISO } from '../lib/dates';
import { RecordStore } from '../lib/metrics';
import { BACKEND, api } from './api';

export interface Queue { id: string; name: string; departmentId: string | null; source: 'manual' | 'genesys' }

/** Indicadores que dependem de instrumentação e podem não existir em produção. */
export interface Availability {
  unique: boolean; queueAbandons: boolean; selfService: boolean; authentication: boolean; integrationErrors: boolean;
  apiErrors: boolean; flowErrors: boolean; invalidOptions: boolean; transferFailures: boolean; transfers: boolean;
}

export interface CurrentUser {
  id: string; email: string; name: string; profile: 'admin' | 'analista_cx' | 'supervisor' | 'gestor'; profileLabel: string;
  permissions: string[]; departments: string[]; genesysConfigured: boolean;
}

export interface LoadResult {
  store: RecordStore;
  departments: Department[];
  uras: Ura[];
  queues: Queue[];
  availability: Availability | null;
  user: CurrentUser;
}

export interface UraDataProvider {
  readonly kind: DataSourceKind;
  readonly label: string;
  load(): Promise<LoadResult>;
}

export const ALL_PERMISSIONS = ['metrics:read', 'catalog:write', 'users:manage', 'goals:write', 'rules:write', 'occurrences:write', 'tests:write', 'changes:write', 'audit:read', 'integration:read', 'integration:manage'];

/** Provedor de dados SIMULADOS (protótipo). Simula latência de rede para exercitar estados de carregamento. */
export const mockProvider: UraDataProvider = {
  kind: 'simulado',
  label: 'Dados simulados',
  async load() {
    await new Promise((r) => setTimeout(r, 450));
    if (sessionStorage.getItem('gui-simulate-error') === '1') {
      sessionStorage.removeItem('gui-simulate-error');
      throw new Error('Falha simulada ao carregar os dados (teste do estado de erro). Clique em "Tentar novamente".');
    }
    const queues = Array.from(new Set(URAS.flatMap((u) => u.queues))).map((name) => ({
      id: name, name, departmentId: URAS.find((u) => u.queues.includes(name))?.departmentId ?? null, source: 'manual' as const,
    }));
    return {
      store: new RecordStore(generateRecords(URAS)),
      departments: DEPARTMENTS,
      uras: URAS,
      queues,
      availability: null,
      user: { id: 'prototipo', email: 'prototipo@local', name: 'Você (protótipo)', profile: 'admin', profileLabel: 'Administrador (protótipo)', permissions: ALL_PERMISSIONS, departments: [], genesysConfigured: false },
    };
  },
};

interface CatalogResponse {
  departments: Department[];
  uras: (Omit<Ura, 'menu' | 'baseVolume' | 'lastChangeNote'> & { lastChange: string })[];
  queues: Queue[];
}

/** Provedor do backend (Etapa 3): catálogo, usuário e métricas horárias vindos da API. */
export const backendProvider: UraDataProvider = {
  kind: 'genesys',
  label: 'Genesys Cloud (via backend)',
  async load() {
    const user = await api<CurrentUser>('GET', '/api/me');
    const catalog = await api<CatalogResponse>('GET', '/api/catalog');
    const to = todayISO();
    const metrics = await api<{ records: HourRecord[]; availability: Availability }>('GET', `/api/metrics/hourly?from=${addDays(to, -119)}&to=${to}`);
    const uras: Ura[] = catalog.uras.map((u) => ({ ...u, menu: [], baseVolume: 0, lastChangeNote: '' }));
    return { store: new RecordStore(metrics.records), departments: catalog.departments, uras, queues: catalog.queues, availability: metrics.availability, user };
  },
};

export const activeProvider: UraDataProvider = BACKEND ? backendProvider : mockProvider;

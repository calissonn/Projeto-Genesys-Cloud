/**
 * Camada de acesso a dados do front-end.
 *
 * O front-end NUNCA fala diretamente com a Genesys Cloud. Em produção ele
 * consumirá a API do backend Gazin URA Intelligence (`/api/...`), que por sua
 * vez autentica via OAuth (Client Credentials) e consulta a Genesys somente
 * em modo leitura. Ver `server/` e `docs/GENESYS_API.md`.
 */
import { generateRecords } from '../data/mockData';
import type { DataSourceKind, Ura } from '../data/types';
import { RecordStore } from '../lib/metrics';

export interface UraDataProvider {
  readonly kind: DataSourceKind;
  readonly label: string;
  load(uras: Ura[]): Promise<RecordStore>;
}

/** Provedor de dados SIMULADOS (MVP). Simula latência de rede para exercitar estados de carregamento. */
export const mockProvider: UraDataProvider = {
  kind: 'simulado',
  label: 'Dados simulados',
  async load(uras) {
    await new Promise((r) => setTimeout(r, 450));
    if (sessionStorage.getItem('gui-simulate-error') === '1') {
      sessionStorage.removeItem('gui-simulate-error');
      throw new Error('Falha simulada ao carregar os dados (teste do estado de erro). Clique em "Tentar novamente".');
    }
    return new RecordStore(generateRecords(uras));
  },
};

/**
 * Provedor do backend (Etapa 3). Ainda NÃO configurado: lança erro explícito
 * em vez de fingir uma integração inexistente.
 */
export const backendProvider: UraDataProvider = {
  kind: 'genesys',
  label: 'Genesys Cloud (via backend)',
  async load() {
    const res = await fetch('/api/metrics/hourly', { credentials: 'include' }).catch(() => null);
    if (!res || !res.ok) {
      throw new Error('Integração com a Genesys Cloud não configurada. Consulte a tela "Integração Genesys".');
    }
    // Formato esperado: HourRecord[] já normalizado pelo backend.
    return new RecordStore(await res.json());
  },
};

export const activeProvider: UraDataProvider =
  import.meta.env.VITE_DATA_SOURCE === 'backend' ? backendProvider : mockProvider;

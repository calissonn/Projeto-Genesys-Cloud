import { isAllowed } from './allowlist.js';
import type { GenesysAuth } from './auth.js';

export class GenesysApiError extends Error {
  constructor(message: string, readonly status: number, readonly path: string) {
    super(message);
  }
}

export interface ClientOptions {
  /** Ex.: https://api.sae1.pure.cloud */
  apiBaseUrl: string;
  maxRequestsPerMinute: number;
  maxRetries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Cliente HTTP somente leitura:
 *  - allowlist de endpoints;
 *  - limitador de taxa (janela deslizante de 60 s);
 *  - retry com backoff exponencial em 429 / 5xx / timeout, respeitando Retry-After;
 *  - renovação do token em 401 (uma vez);
 *  - helpers de paginação (pageNumber/pageCount e cursor) e de jobs assíncronos.
 */
export class GenesysClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private sent: number[] = [];
  /** Contadores para diagnóstico (expostos no status da integração). */
  readonly stats = { requests: 0, retries: 0, rateLimited: 0, errors: 0 };

  constructor(private readonly auth: GenesysAuth, private readonly opts: ClientOptions) {
    this.base = opts.apiBaseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  get<T>(path: string, query?: Record<string, string | number | boolean | undefined>) {
    const qs = query
      ? '?' + Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
      : '';
    return this.request<T>('GET', path, undefined, qs);
  }

  /** POST somente para endpoints de CONSULTA presentes na allowlist. */
  query<T>(path: string, body: unknown) {
    return this.request<T>('POST', path, body);
  }

  private async throttle() {
    const windowMs = 60_000;
    for (;;) {
      const now = Date.now();
      this.sent = this.sent.filter((t) => now - t < windowMs);
      if (this.sent.length < this.opts.maxRequestsPerMinute) {
        this.sent.push(now);
        return;
      }
      await this.sleep(windowMs - (now - this.sent[0]) + 10);
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, qs = ''): Promise<T> {
    if (!isAllowed(method, path)) {
      throw new GenesysApiError(`Chamada bloqueada pela política somente leitura: ${method} ${path}`, 0, path);
    }
    const maxRetries = this.opts.maxRetries ?? 5;
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      const token = await this.auth.getToken();
      this.stats.requests++;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 60_000);
      let res: Response;
      try {
        res = await this.fetchImpl(this.base + path + qs, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        if (attempt >= maxRetries) throw new GenesysApiError(`Falha de rede/timeout em ${path}: ${(e as Error).message}`, 0, path);
        await this.sleep(backoff(attempt));
        continue;
      }
      clearTimeout(timer);
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        this.auth.invalidate();
        continue;
      }
      const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
      if (res.status === 429) this.stats.rateLimited++;
      if (retryable && attempt < maxRetries) {
        this.stats.retries++;
        const ra = Number(res.headers.get('retry-after'));
        await this.sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt));
        continue;
      }
      this.stats.errors++;
      throw new GenesysApiError(`Genesys respondeu HTTP ${res.status} em ${method} ${path}`, res.status, path);
    }
  }

  /** Paginação por pageNumber/pageSize (listas de configuração: flows, milestones, outcomes, queues). */
  async *paginate<T>(path: string, query: Record<string, string | number | boolean | undefined> = {}, pageSize = 100) {
    for (let page = 1; ; page++) {
      const res = await this.get<{ entities?: T[]; pageCount?: number }>(path, { ...query, pageSize, pageNumber: page });
      for (const e of res.entities ?? []) yield e;
      if (!res.pageCount || page >= res.pageCount) return;
    }
  }

  /** Executa um job assíncrono de analytics (cria → aguarda FULFILLED → lê páginas por cursor). */
  async runAsyncJob<T>(createPath: string, body: unknown, opts: { pollMs?: number; maxWaitMs?: number } = {}): Promise<T[]> {
    const { jobId } = await this.query<{ jobId: string }>(createPath, body);
    const statusPath = `${createPath}/${jobId}`;
    const started = Date.now();
    for (;;) {
      const st = await this.get<{ state: string; errorMessage?: string }>(statusPath);
      if (st.state === 'FULFILLED') break;
      if (st.state === 'FAILED' || st.state === 'CANCELLED' || st.state === 'EXPIRED') {
        throw new GenesysApiError(`Job ${jobId} terminou com estado ${st.state}${st.errorMessage ? `: ${st.errorMessage}` : ''}`, 0, statusPath);
      }
      if (Date.now() - started > (opts.maxWaitMs ?? 30 * 60_000)) throw new GenesysApiError(`Job ${jobId} excedeu o tempo de espera`, 0, statusPath);
      await this.sleep(opts.pollMs ?? 5000);
    }
    const out: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.get<{ results?: T[]; conversations?: T[]; cursor?: string }>(`${statusPath}/results`, { cursor });
      out.push(...(page.results ?? page.conversations ?? []));
      cursor = page.cursor;
    } while (cursor);
    return out;
  }
}

export function backoff(attempt: number) {
  const base = Math.min(60_000, 1000 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

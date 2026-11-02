/**
 * OAuth Client Credentials da Genesys Cloud.
 * POST https://login.{região}/oauth/token  (grant_type=client_credentials, Basic auth)
 * `loginBaseUrl` = https://login.{região} (ou o servidor simulado nos testes).
 * O token fica apenas em memória do servidor e é renovado antes de expirar.
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class GenesysAuth {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(
    /** Ex.: https://login.sae1.pure.cloud */
    private readonly loginBaseUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getToken(): Promise<string> {
    // Renova com 5 min de folga.
    if (this.token && this.now() < this.expiresAt - 5 * 60_000) return this.token;
    if (!this.inflight) {
      this.inflight = this.fetchToken().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  invalidate() {
    this.token = null;
    this.expiresAt = 0;
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await this.fetchImpl(`${this.loginBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      // Não incluir corpo/credenciais no erro para não vazar em logs.
      throw new Error(`Falha na autenticação OAuth com a Genesys Cloud (HTTP ${res.status}).`);
    }
    const body = (await res.json()) as TokenResponse;
    this.token = body.access_token;
    this.expiresAt = this.now() + body.expires_in * 1000;
    return this.token;
  }
}

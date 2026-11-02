/**
 * Redação de resumo executivo por IA generativa (Claude) — OPCIONAL e desligada por padrão.
 *
 * Princípios:
 *  - A IA não calcula nada: recebe as análises já produzidas pelo motor estatístico do sistema
 *    e apenas redige o texto.
 *  - Somente agregados e textos das análises: o payload é validado por esquema (campos fixos)
 *    e recusado se contiver padrões de dados pessoais (CPF, telefone, e-mail).
 *  - Ativação exige AI_ENABLED=true e ANTHROPIC_API_KEY no servidor, após autorização da Gazin.
 */
import Anthropic from '@anthropic-ai/sdk';

export interface AiConfig {
  enabled: boolean;
  model: string;
  apiKey: string | null;
  /** Somente testes (servidor falso). */
  baseURL?: string;
  maxPerUserPerHour: number;
}

export function loadAiConfig(env: NodeJS.ProcessEnv): AiConfig {
  return {
    enabled: env.AI_ENABLED === 'true' && !!env.ANTHROPIC_API_KEY,
    model: env.AI_MODEL ?? 'claude-opus-5-5',
    apiKey: env.ANTHROPIC_API_KEY ?? null,
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
    maxPerUserPerHour: Number(env.AI_MAX_PER_USER_PER_HOUR ?? 20),
  };
}

/** Esquema do payload aceito (JSON Schema do Fastify) — nada além destes campos. */
const STR = { type: 'string', maxLength: 1500 } as const;
const STR_LIST = { type: 'array', maxItems: 12, items: STR } as const;
export const AI_PAYLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['janela', 'resumoPorRegras', 'analises'],
  properties: {
    janela: { type: 'string', maxLength: 60 },
    resumoPorRegras: STR_LIST,
    resultadosPositivos: STR_LIST,
    analises: {
      type: 'array', maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        required: ['titulo', 'problema'],
        properties: {
          titulo: STR, tipo: { type: 'string', maxLength: 40 }, criticidade: { type: 'string', maxLength: 20 }, confianca: { type: 'string', maxLength: 20 },
          justificativaConfianca: STR, problema: STR, evidencias: STR_LIST, causasPossiveis: STR_LIST, recomendacoes: STR_LIST,
          impactoEsperado: STR, validacao: STR_LIST,
        },
      },
    },
  },
} as const;

export interface AiPayload {
  janela: string;
  resumoPorRegras: string[];
  resultadosPositivos?: string[];
  analises: Record<string, string | string[]>[];
}

/** Padrões de dados pessoais que nunca devem sair do sistema. */
const PII_PATTERNS: [string, RegExp][] = [
  ['CPF', /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/],
  ['telefone', /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/],
  ['e-mail', /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
];

export function findPii(payload: unknown): string | null {
  const text = JSON.stringify(payload);
  for (const [name, re] of PII_PATTERNS) if (re.test(text)) return name;
  return null;
}

const SYSTEM_PROMPT = `Você redige análises executivas para a equipe de Customer Experience da Gazin sobre as URAs (unidades de resposta audível) do contact center.

Você recebe, em JSON, análises já calculadas por um motor estatístico: problema, evidências numéricas, grau de confiança, possíveis causas, recomendações, impacto esperado e forma de validar.

Escreva em português do Brasil um resumo executivo para supervisores e gestores:
- Use somente os números e fatos presentes no JSON. Não calcule nem estime valores novos.
- Causas são hipóteses: escreva "possível causa" ou "hipótese", nunca como fato comprovado.
- Mantenha o grau de confiança informado em cada prioridade.
- Estrutura: uma frase de abertura com a situação geral; as até 3 prioridades (problema, evidência principal, confiança, primeira ação e como validar); resultados positivos, se houver; próximos passos.
- Texto corrido e listas simples, sem tabelas, com no máximo 350 palavras.`;

export class AiService {
  private readonly client: Anthropic | null;
  private readonly usage = new Map<string, number[]>();

  constructor(readonly cfg: AiConfig) {
    this.client = cfg.enabled ? new Anthropic({ apiKey: cfg.apiKey!, baseURL: cfg.baseURL, maxRetries: 2, timeout: 120_000 }) : null;
  }

  status() {
    return this.cfg.enabled
      ? { enabled: true, model: this.cfg.model }
      : { enabled: false, model: null, reason: 'Redação por IA desativada no servidor (requer autorização da Gazin, AI_ENABLED=true e chave da API).' };
  }

  /** Limite de uso por usuário (janela deslizante de 1 hora). */
  allow(userId: string, now = Date.now()) {
    const recent = (this.usage.get(userId) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= this.cfg.maxPerUserPerHour) return false;
    recent.push(now);
    this.usage.set(userId, recent);
    return true;
  }

  async summarize(payload: AiPayload): Promise<{ text: string; model: string; inputTokens: number; outputTokens: number }> {
    if (!this.client) throw new Error('IA desativada.');
    const response = await this.client.beta.messages.create({
      model: this.cfg.model,
      max_tokens: 4000,
      // Se o modelo recusar por política, a API tenta o modelo de contingência recomendado.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Análises do período (JSON):\n${JSON.stringify(payload)}` }],
    });
    if (response.stop_reason === 'refusal') throw new Error('O modelo recusou a solicitação. Use a análise por regras.');
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    if (!text) throw new Error('A IA não retornou texto.');
    return { text, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  }
}

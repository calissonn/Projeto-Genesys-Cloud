/**
 * Servidor FALSO da API Messages da Anthropic — somente para testes e homologação.
 * Registra as requisições recebidas (para verificar o que foi enviado) e devolve um texto fixo.
 */
import Fastify from 'fastify';

export interface CapturedRequest { headers: Record<string, unknown>; body: Record<string, unknown> }

export async function startAnthropicMock(port = 0, opts: { refuse?: boolean } = {}) {
  const app = Fastify({ logger: false });
  const requests: CapturedRequest[] = [];
  app.post('/v1/messages', async (req) => {
    requests.push({ headers: req.headers as Record<string, unknown>, body: req.body as Record<string, unknown> });
    const model = String((req.body as { model?: string }).model);
    return {
      id: `msg_mock_${requests.length}`, type: 'message', role: 'assistant', model,
      content: opts.refuse ? [] : [{ type: 'text', text: 'RESUMO SIMULADO (servidor falso de testes): as prioridades foram analisadas a partir dos agregados recebidos.' }],
      stop_reason: opts.refuse ? 'refusal' : 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 80 },
    };
  });
  const url = await app.listen({ port, host: '127.0.0.1' });
  return { app, url, requests };
}

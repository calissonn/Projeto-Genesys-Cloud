import { orchestrator } from '@/lib/orchestrator.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Repassa os eventos do WebSocket do orquestrador para o navegador como Server-Sent Events.
 * A conexão com o orquestrador (e o token) fica no servidor.
 */
export async function GET(req: Request) {
  let orch;
  try {
    orch = orchestrator();
  } catch (err) {
    return new Response((err as Error).message, { status: 500 });
  }
  const encoder = new TextEncoder();
  let ws: WebSocket | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* fluxo já encerrado */
        }
      };
      const close = () => {
        if (ping) clearInterval(ping);
        ping = null;
        try {
          ws?.close();
        } catch {
          /* ignora */
        }
        try {
          controller.close();
        } catch {
          /* ignora */
        }
      };
      send('retry: 2000\n\n');
      ws = new WebSocket(`${orch.ws}?token=${encodeURIComponent(orch.token)}`);
      ws.onmessage = (e) => send(`data: ${String(e.data)}\n\n`);
      ws.onerror = () => close();
      ws.onclose = () => close();
      ping = setInterval(() => send(': ping\n\n'), 15000);
      req.signal.addEventListener('abort', close);
    },
    cancel() {
      if (ping) clearInterval(ping);
      ws?.close();
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}

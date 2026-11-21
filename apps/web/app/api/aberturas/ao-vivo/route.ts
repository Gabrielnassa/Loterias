import { fonteDeDados } from '@/lib/fonte-dados';
import { aoVivo } from '@/lib/servico';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INTERVALO_MS = 5000;

/**
 * GET /api/aberturas/ao-vivo?uf=SP&destaque=codigo (SSE) — ordem de chegada da UF, emitida logo
 * após cada leitura (slots de 5 s alinhados ao relógio).
 */
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams;
  const uf = s.get('uf') ?? undefined;
  const destaque = s.get('destaque') ?? undefined;
  const fonte = fonteDeDados();
  const codificador = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const corpo = new ReadableStream<Uint8Array>({
    start(ctl) {
      const enviar = async () => {
        try {
          const d = await aoVivo(fonte, { ...(uf ? { uf } : {}), ...(destaque ? { destaque } : {}) });
          ctl.enqueue(codificador.encode(`event: leitura\ndata: ${JSON.stringify(d)}\n\n`));
        } catch (e) {
          ctl.enqueue(codificador.encode(`event: erro\ndata: ${JSON.stringify({ erro: String(e) })}\n\n`));
        }
        const proxima = INTERVALO_MS - (Date.now() % INTERVALO_MS) + 250;
        timer = setTimeout(enviar, proxima);
      };
      ctl.enqueue(codificador.encode('retry: 3000\n\n'));
      void enviar();
      req.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        try {
          ctl.close();
        } catch {
          /* já fechado */
        }
      });
    },
    cancel() {
      clearTimeout(timer);
    },
  });
  return new Response(corpo, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', connection: 'keep-alive' },
  });
}

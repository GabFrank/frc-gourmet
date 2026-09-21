import { FastifyInstance } from 'fastify';
import { mesaEvents, MesaEventPayload } from '../utils/mesa-events.utils';
import { consumirStreamToken } from '../utils/stream-token.utils';

/**
 * Stream SSE para mesas y comandas del PdV (desktop + tablets HTTP en modo servidor).
 *
 * Auth: token efímero de un solo uso emitido por RPC `stream-token` con
 * contexto `'pdv'`. Va por query (`?token=...`) porque `EventSource` del
 * navegador no permite mandar headers custom.
 *
 * El feed completo se obtiene por RPC (`getPdvMesas` / `getComandas`); este
 * stream solo avisa "algo cambió, recargá X" + seq para orden.
 *
 * X-Accel-Buffering: no — obligatorio para que nginx/Cloudflare no bufericen.
 * Heartbeat 25s — mantiene viva la conexión (Cloudflare cierra idle ~100s).
 */
export function registerMesaSseRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/pdv/mesas/stream', async (request, reply) => {
    const q = request.query as any;

    // Auth por token efímero (EventSource no manda headers).
    const verificacion = await consumirStreamToken((q?.token || '').toString(), 'pdv');
    if (!verificacion.ok) {
      console.warn('[mesa-sse] conexión rechazada:', verificacion.motivo);
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    // Cabeceras SSE + tomamos control del socket (hijack) para escribir a mano.
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no', // ← crucial para Cloudflare/nginx
    });
    reply.raw.write('retry: 3000\n\n');

    const onChange = (payload: MesaEventPayload) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        /* socket cerrado */
      }
    };
    mesaEvents.on('change', onChange);

    // Heartbeat: comentario SSE cada 25s para mantener viva la conexión
    // (proxies/Cloudflare cierran conexiones idle ~100s).
    const ping = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        /* noop */
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(ping);
      mesaEvents.off('change', onChange);
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    reply.hijack();
  });
}

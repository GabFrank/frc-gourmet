import { FastifyInstance } from 'fastify';
import { comandaEvents, ComandaEventPayload } from '../utils/comanda-events.utils';

/**
 * KDS Fase 3 — stream SSE para pantallas web (Google TV / tablet) en modo
 * servidor. Las pantallas se conectan a `GET /api/kds/stream` y reciben cada
 * cambio de ComandaItem en tiempo real sin polling.
 *
 * Auth: como `EventSource` del navegador no permite mandar headers, el JWT va
 * por query (`?token=...`). Se verifica con el mismo secreto que el resto.
 *
 * Filtro opcional por sectores: `?sectores=1,3` → solo eventos de esos sectores
 * (los que no traen sectorId, ej. algunos cancelados, se dejan pasar).
 *
 * El feed de datos completo se obtiene por RPC (`get-kds-comandas`); este stream
 * solo avisa "algo cambió, recargá" + el detalle mínimo del cambio.
 */
export function registerKdsSseRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/kds/stream', async (request, reply) => {
    const q = request.query as any;

    // Auth por token en query (EventSource no manda Authorization header).
    const token = (q?.token || '').toString();
    try {
      if (!token) throw new Error('sin token');
      (fastify as any).jwt.verify(token);
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    const sectores: number[] = (q?.sectores || '')
      .toString()
      .split(',')
      .map((s: string) => parseInt(s, 10))
      .filter((n: number) => !!n);

    // Cabeceras SSE + tomamos control del socket (hijack) para escribir a mano.
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 3000\n\n');

    const onChange = (payload: ComandaEventPayload) => {
      try {
        if (sectores.length > 0 && payload.sectorId != null && !sectores.includes(payload.sectorId)) return;
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch { /* socket cerrado */ }
    };
    comandaEvents.on('change', onChange);

    // Heartbeat: comentario SSE cada 25s para mantener viva la conexión
    // (proxies/wifi cierran conexiones idle).
    const ping = setInterval(() => {
      try { reply.raw.write(': ping\n\n'); } catch { /* noop */ }
    }, 25_000);

    const cleanup = () => {
      clearInterval(ping);
      comandaEvents.off('change', onChange);
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    reply.hijack();
  });
}

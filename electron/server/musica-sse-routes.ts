import { FastifyInstance } from 'fastify';
import { musicaEvents, MusicaEventPayload } from '../utils/musica-events.utils';
import { consumirStreamToken } from '../utils/stream-token.utils';

/**
 * Stream SSE del módulo de Música: el control en la PWA recibe los cambios sin
 * preguntar cada pocos segundos.
 *
 * Auth con **token efímero de un solo uso** (`?token=`), no con el JWT de
 * sesión: `EventSource` no permite headers, y meter el token de sesión en la
 * query lo deja en logs de acceso, historial y proxies. El token de stream vive
 * 60 s, se consume al abrir y solo sirve para este alcance.
 * Ver `electron/utils/stream-token.utils.ts`.
 *
 * El stream avisa "cambió esto"; el detalle completo se pide por RPC.
 */
export function registerMusicaSseRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/musica/stream', async (request, reply) => {
    const q = request.query as any;
    const verificacion = await consumirStreamToken((q?.token || '').toString(), 'musica');
    if (!verificacion.ok) {
      // Sin detalle hacia afuera: el motivo queda en el log del servidor.
      console.warn('[musica-sse] conexión rechazada:', verificacion.motivo);
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      // Sin esto, nginx y varios proxies bufferean la respuesta y los eventos
      // llegan en bloque (o no llegan).
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 5000\n\n');

    const onChange = (payload: MusicaEventPayload) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        /* socket cerrado */
      }
    };
    musicaEvents.on('change', onChange);

    // Heartbeat: mantiene viva la conexión frente a proxies y wifi que cortan
    // lo que está idle. Es también cómo el cliente detecta que sigue conectado.
    const ping = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        /* noop */
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(ping);
      musicaEvents.off('change', onChange);
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    reply.hijack();
  });
}

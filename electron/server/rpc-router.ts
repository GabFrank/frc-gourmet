import { FastifyInstance } from 'fastify';
import { invokeHandler } from '../utils/handler-registry';

/**
 * Endpoint generico que delega a `handlerRegistry`. Hace de pegamento entre
 * HTTP y los 700+ handlers IPC ya registrados en el process.
 *
 * Body shape:
 *   { "method": "get-personas", "params": [arg1, arg2] }
 *
 * Response:
 *   200 { "result": <return value> }
 *   401 { "error": "unauthorized" } (si no hay JWT valido)
 *   404 { "error": "..." }
 *   500 { "error": "..." }
 *
 * Channel allowlist: por seguridad, ciertos channels nunca deberian ser
 * accesibles via HTTP (ej. handlers que reinician la app, manipulan el
 * filesystem fuera de archivos de usuario, manejan keytar). Hardcodeados
 * abajo en `BLOCKED_CHANNELS`.
 */

const BLOCKED_CHANNELS = new Set<string>([
  'set-current-user',  // current user es session local del Electron, no del cliente HTTP
  'reset-database',
  'restart-app',
  // F4 podra agregar mas si descubrimos handlers riesgosos
]);

export function registerRpcRoute(fastify: FastifyInstance): void {
  fastify.post<{ Body: { method: string; params?: any[] } }>('/api/rpc', {
    onRequest: [(fastify as any).authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['method'],
        properties: {
          method: { type: 'string', minLength: 1 },
          params: { type: 'array' },
        },
      },
    },
  }, async (request, reply) => {
    const { method, params } = request.body;

    if (BLOCKED_CHANNELS.has(method)) {
      reply.code(403);
      return { error: 'channel_bloqueado_para_http' };
    }

    try {
      const result = await invokeHandler(method, ...(params || []));
      return { result };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (/no registrado/.test(msg)) {
        reply.code(404);
        return { error: msg };
      }
      console.error(`[rpc] ${method} failed:`, err);
      reply.code(500);
      return { error: msg };
    }
  });
}

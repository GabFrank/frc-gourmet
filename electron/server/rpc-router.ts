import { FastifyInstance } from 'fastify';
import { invokeHandler } from '../utils/handler-registry';

/**
 * Endpoint generico que delega a `handlerRegistry`. Hace de pegamento entre
 * HTTP y los 700+ handlers IPC ya registrados en el process. F3.2 agregara
 * auth middleware (JWT validation).
 *
 * Body shape:
 *   { "method": "get-personas", "params": [arg1, arg2] }
 *
 * Response:
 *   200 { "result": <return value> }
 *   404 { "error": "unknown method" }
 *   500 { "error": "<message>" }
 */
export function registerRpcRoute(fastify: FastifyInstance): void {
  fastify.post<{ Body: { method: string; params?: any[] } }>('/api/rpc', {
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

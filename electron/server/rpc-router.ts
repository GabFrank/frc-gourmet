import { FastifyInstance } from 'fastify';
import { DataSource } from 'typeorm';
import { invokeHandlerWithContext } from '../utils/handler-registry';
import { withRequestUser } from '../utils/auth.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

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

export function registerRpcRoute(fastify: FastifyInstance, dataSource?: DataSource): void {
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
      // F5 paso 3: propagar al handler el device_id que vino en el JWT, asi
      // los handlers de creacion (createVenta, etc.) lo persisten sin tener
      // que cambiar la firma del IPC.
      const jwtUser: any = (request as any).user || {};
      const userId = typeof jwtUser.id === 'number' ? jwtUser.id : null;
      const ctx = {
        userId,
        deviceId: typeof jwtUser.device_id === 'number' ? jwtUser.device_id : null,
      };

      // P0-1: para que el sweep de `ensurePermission` funcione en mode=server,
      // resolvemos el Usuario del JWT y lo ponemos en el AsyncLocalStorage
      // antes de invocar el handler. Sin esto, `checkPermission` leeria del
      // `getCurrentUser()` global del main process (que es el operador del
      // server, no el cliente HTTP que hizo este request).
      let requestUser: Usuario | null = null;
      if (userId != null && dataSource) {
        try {
          requestUser = await dataSource.getRepository(Usuario).findOne({
            where: { id: userId },
          });
        } catch (e) {
          console.warn('[rpc] no se pudo cargar usuario del JWT para autorizacion:', e);
        }
      }

      const invoke = () => invokeHandlerWithContext(method, ctx, ...(params || []));
      const result = requestUser ? await withRequestUser(requestUser, invoke) : await invoke();
      return { result };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (/no registrado/.test(msg)) {
        reply.code(404);
        return { error: msg };
      }
      // Errores de permiso → 403 con mensaje claro al cliente.
      if (err?.code === 'FORBIDDEN' || /PERMISO REQUERIDO/.test(msg)) {
        reply.code(403);
        return { error: msg };
      }
      if (err?.code === 'UNAUTHORIZED' || /NO AUTENTICADO/.test(msg)) {
        reply.code(401);
        return { error: msg };
      }
      console.error(`[rpc] ${method} failed:`, err);
      reply.code(500);
      return { error: msg };
    }
  });
}

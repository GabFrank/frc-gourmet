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

// C-05: /api/rpc queda en default-allow (la allowlist de canales legítimos sería
// ~830, casi todo el registro, con alto costo/riesgo y poco valor marginal — ver
// docs/HALLAZGOS-AUDITORIA-DESKTOP.md). El lever de seguridad real es esta
// deny-list: canales que un cliente HTTP remoto (PWA / modo cliente) nunca debería
// poder invocar porque tocan el NODO SERVIDOR (su disco, su BD, su proceso, sus
// secretos). La defensa por-handler (ensurePermission) ya cubre los datos de
// negocio; esto cierra los canales de infraestructura.
const BLOCKED_CHANNELS = new Set<string>([
  'set-current-user',  // current user es session local del Electron, no del cliente HTTP
  'reset-database',
  'restart-app',

  // Backups y restauración (destructivos / filesystem del servidor)
  'backup-db-reset',
  'backup-clear-images',
  'backup-restore',
  'backup-delete',
  'backup-create',
  'backup-create-and-export',
  'backup-trigger-auto-now',
  'backup-config-set',
  'backup-send-whatsapp',
  'backup-pick-folder',
  'backup-pick-restore-file',

  // Configuración de BD / modo de la app + reinicio (setup local, no remoto)
  'db-config-save',
  'db-config-init-postgres',
  'db-config-restart-app',
  'db-config-test-connection',
  'app-mode-save',
  'app-mode-test-server',

  // Musica: abren cosas EN LA PC DEL SERVIDOR (el navegador de autorizacion y
  // la app de Spotify). Disparar eso desde un cliente remoto no tiene sentido y
  // es superficie de sobra: se hacen desde el desktop del local.
  'musica-conectar',
  'musica-cancelar-conexion',
  'musica-abrir-spotify',

  // Actualización / ciclo de vida del proceso servidor
  'auto-update:quit-and-install',
  'auto-update:check-now',

  // Secretos / credenciales
  'set-notif-secret',   // secreto de notificaciones (WhatsApp/email)
  'ia-config-set',      // API keys de IA/OCR

  // Seeds (se ejecutan internamente en el arranque, no vía HTTP)
  'seed-permissions',
  'seed-configuracion-rrhh',
  'seed-liquidacion-conceptos',

  // Sistema del host / diálogos nativos en el servidor
  'get-system-mac-address',
  'factura-import-pick-file',

  // Gestión del propio nodo servidor (un cliente remoto no controla el túnel)
  'remote-tunnel-start',
  'remote-tunnel-stop',
]);

/**
 * Prefijos de canal bloqueados en bloque. Van por prefijo y no por nombre para
 * que un handler nuevo de la familia quede cerrado por default (la deny-list
 * por nombre se olvida sola).
 *
 * `window:*` = chrome de la ventana física del nodo servidor: minimizar,
 * cerrar, recargar, DevTools, zoom, pantalla completa. Un cliente HTTP
 * autenticado (PWA de un mozo, nodo cliente) podría cerrar o recargar la caja
 * registradora en medio de una venta. Cada cliente maneja SU ventana por IPC
 * local — el preload nunca manda estos canales por HTTP.
 */
const BLOCKED_PREFIXES = ['window:'];

function canalBloqueado(method: string): boolean {
  return BLOCKED_CHANNELS.has(method) || BLOCKED_PREFIXES.some((p) => method.startsWith(p));
}

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

    if (canalBloqueado(method)) {
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

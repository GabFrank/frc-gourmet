/**
 * Namespace público `/pub/*` — superficie para la WEB APP DE PEDIDOS ONLINE.
 *
 * Fase 0 del plan `docs/arquitectura/webapp-pedidos-plan.md`.
 *
 * REGLA NO NEGOCIABLE: el cliente final NUNCA habla con `/api/rpc` (que puede
 * invocar cualquiera de los ~700 handlers con un JWT de staff). Este namespace
 * expone únicamente una **whitelist explícita** de operaciones cliente-safe,
 * autenticadas (cuando aplica) con el **JWT de cliente** (`customer-jwt.utils`,
 * secret + audiencia propios).
 *
 * Cómo se agregan operaciones (en fases siguientes): cada módulo público llama
 * `registerPublicOperation('menu.get', { channel: 'get-menu-online', requiresAuth: false })`
 * y queda disponible vía `POST /pub/rpc { op: 'menu.get', params: [...] }`.
 * NUNCA se acepta un channel arbitrario por nombre — solo claves de la whitelist.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { invokeHandlerWithContext } from '../utils/handler-registry';
import { verifyCustomerToken, VerifiedCustomer } from '../utils/customer-jwt.utils';

/** Una operación pública mapea una clave estable → un channel IPC existente. */
export interface PublicOperation {
  /** channel IPC subyacente a invocar (debe estar en el handlerRegistry). */
  channel: string;
  /** si true, exige JWT de cliente válido en Authorization: Bearer. */
  requiresAuth: boolean;
  /**
   * si true (y requiresAuth false): resuelve el cliente si viene token, pero NO
   * rechaza si falta. Para ops que admiten invitado y cliente (ej. pedido MESA_QR).
   */
  optionalAuth?: boolean;
  /** descripción corta para auditar la whitelist. */
  description?: string;
}

/**
 * Whitelist de operaciones públicas. Arranca vacía en Fase 0 (la máquina está,
 * los endpoints de menú/pedido/cuenta se registran en Fases 1-5). Se llena vía
 * `registerPublicOperation`, no editando un channel suelto en cada llamada.
 */
const PUBLIC_OPERATIONS = new Map<string, PublicOperation>();

export function registerPublicOperation(op: string, def: PublicOperation): void {
  if (PUBLIC_OPERATIONS.has(op)) {
    console.warn(`[pub] operación pública '${op}' ya registrada; se sobrescribe.`);
  }
  PUBLIC_OPERATIONS.set(op, def);
}

export function listPublicOperations(): string[] {
  return Array.from(PUBLIC_OPERATIONS.keys()).sort();
}

/** Extrae y verifica el JWT de cliente. Devuelve null si falta/es inválido. */
async function resolveCustomer(request: FastifyRequest): Promise<VerifiedCustomer | null> {
  const auth = request.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(auth));
  if (!m) return null;
  try {
    return await verifyCustomerToken(m[1]);
  } catch {
    return null;
  }
}

export function registerPublicRoutes(fastify: FastifyInstance): void {
  // ---- Health público (sin auth) — ping del namespace de pedidos online.
  fastify.get('/pub/health', async () => ({
    ok: true,
    scope: 'public-ordering',
    operations: PUBLIC_OPERATIONS.size,
    timestamp: new Date().toISOString(),
  }));

  // ---- RPC público acotado por whitelist.
  fastify.post<{ Body: { op: string; params?: any[] } }>(
    '/pub/rpc',
    {
      // Rate limit más estricto que el global (300/min) para la superficie pública.
      config: {
        rateLimit: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
      schema: {
        body: {
          type: 'object',
          required: ['op'],
          properties: {
            op: { type: 'string', minLength: 1 },
            params: { type: 'array' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { op: string; params?: any[] } }>, reply: FastifyReply) => {
      const { op, params } = request.body;

      const def = PUBLIC_OPERATIONS.get(op);
      if (!def) {
        reply.code(403);
        return { error: 'operacion_no_publica' };
      }

      let customer: VerifiedCustomer | null = null;
      if (def.requiresAuth) {
        customer = await resolveCustomer(request);
        if (!customer) {
          reply.code(401);
          return { error: 'cliente_no_autenticado' };
        }
      } else if (def.optionalAuth) {
        // Resuelve el cliente si viene token, pero NO rechaza si falta (el handler
        // decide según el canal — ej. MESA_QR admite invitado).
        customer = await resolveCustomer(request);
      }

      try {
        // El contexto NO lleva userId de staff: las operaciones públicas usan
        // handlers que no exigen permisos de staff. El cliente autenticado se
        // propaga como `customerId` para que el handler sepa a quién atiende.
        const ctx = { userId: null, deviceId: null, customerId: customer?.sub ?? null, clientIp: request.ip };
        const result = await invokeHandlerWithContext(def.channel, ctx, ...(params || []));
        return { result };
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (/no registrado/.test(msg)) {
          reply.code(404);
          return { error: 'operacion_no_disponible' };
        }
        // No filtrar el mensaje interno (posible SQL/stack) al cliente público.
        console.error(`[pub] op '${op}' (channel '${def.channel}') falló:`, err);
        reply.code(500);
        return { error: 'error_interno' };
      }
    },
  );
}

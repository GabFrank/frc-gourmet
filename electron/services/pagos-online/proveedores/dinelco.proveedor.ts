/**
 * dinelco Checkout embebido como proveedor (PLAN-tienda-pagos-dinelco).
 *
 * Documentación: https://test-checkout.dinelco.com.py/dinelco-checkout/docs/es/
 * - API REST con `Authorization: Bearer di_sk_…` (una sola clave secreta, solo en el servidor).
 * - El cobro es una sesión (`POST /checkout-session`) que devuelve un `integrityToken` (~10 min).
 *   El storefront lo manda con un formulario oculto a `{host}/d/api/checkout-session/validate`,
 *   dentro del iframe `dinelcoCheckout`. dinelco solo deja embeber desde dominios registrados.
 * - El resultado sale de CONSULTAR la sesión. El aviso (`callbackUrl`) no tiene firma ni reintentos:
 *   solo dispara la consulta.
 * - Tras un rechazo la sesión sigue abierta en dinelco; acá se da por FALLIDO y el storefront saca
 *   el iframe (el cliente elige reintentar o pagar con otro medio). El job sigue consultando el
 *   intento FALLIDO: un aprobado tardío entra como pago.
 * - Reversa total por API dentro de 24 h (`POST /payment/reversal`) = devolución automática.
 *
 * Identificadores: `sesionId` = el intento como entero (`pedido.id * 100 + intento`), así un aviso
 * de un intento viejo se sabe de qué pedido es. La referencia ante dinelco (`clientReferenceId`) es
 * `FRCG-<intento>-<6 hex al azar>`: no choca con otros entornos que comparten el comercio de prueba.
 * `datos` (`pago_datos_json`) guarda la referencia, el `sessionId` de dinelco, el token y las
 * referencias anteriores del mismo intento (si se renovó el token).
 */
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { FORMA_PAGO_DINELCO } from '../../../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { TiendaOnlineConfig } from '../../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { ResultadoPago } from '../interpretar-pago';
import { valoresCompletos } from './config-proveedor';
import { CobroGuardado, CobroInput, ContextoProveedor, CuentaPago, FetchLike, InicioCobro, ProveedorError, ProveedorPagoOnline } from './tipos';

export const PROVEEDOR_DINELCO = 'DINELCO';

export const HOST_DINELCO_PRUEBA = 'test-checkout.dinelco.com.py';
export const HOST_DINELCO_PRODUCCION = 'checkout.dinelco.com.py';

/** Sin pago, pasado el vencimiento del intento por más de esto, se da por vencido. */
const GRACIA_VENCIMIENTO_MS = 30 * 60_000;
/** El token se renueva si le queda menos que esto (el cliente tiene que alcanzar a cargar la tarjeta). */
const MARGEN_TOKEN_MS = 60_000;
/** Cuántas sesiones anteriores del mismo intento se siguen mirando. */
const MAX_PREVIAS = 10;
const REF = /^FRCG-(\d{1,15})-([0-9a-f]{6,32})$/;

export interface DinelcoConfig {
  apiKey: string;
  entorno: 'PRUEBA' | 'PRODUCCION';
}

export function hostDinelco(c: { entorno: string }): string {
  return c.entorno === 'PRODUCCION' ? HOST_DINELCO_PRODUCCION : HOST_DINELCO_PRUEBA;
}
const api = (c: DinelcoConfig) => `https://${hostDinelco(c)}/dinelco-checkout/api/v1`;
export const validarUrlDinelco = (c: DinelcoConfig) => `https://${hostDinelco(c)}/d/api/checkout-session/validate`;

export function referenciaDinelco(proceso: number, sufijo = randomBytes(3).toString('hex')): string {
  return `FRCG-${proceso}-${sufijo}`;
}

async function llamar(c: DinelcoConfig, f: FetchLike, metodo: 'GET' | 'POST', ruta: string, body?: any): Promise<{ status: number; body: any; raw: string }> {
  const r = await f(api(c) + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await r.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
  return { status: r.status, body: json, raw: raw.slice(0, 2000) };
}

function mensaje(b: any): string {
  const m = b?.message;
  const t = Array.isArray(m) ? m.join(', ') : m ? String(m) : '';
  return [b?.errorCode, t].filter(Boolean).join(' · ');
}

function credencialesRechazadas(r: { status: number; body: any }, que: string): ProveedorError | null {
  if (r.status === 401 || r.status === 403) {
    return new ProveedorError('dinelco_credenciales', `dinelco rechazó la clave al ${que} (HTTP ${r.status}${mensaje(r.body) ? ' · ' + mensaje(r.body) : ''})`, r.status);
  }
  return null;
}

/** Lo que se guarda del pago (sin datos del pagador): para el historial y el detalle. */
function resumenPago(s: any): any {
  const p = s?.payment || null;
  return {
    sessionId: s?.sessionId ?? null,
    sessionStatus: s?.sessionStatus ?? null,
    clientReferenceId: s?.clientReferenceId ?? null,
    payment: p ? {
      id: p.id ?? null, status: p.status ?? null, message: p.message ?? null, extendedMessage: p.extendedMessage ?? null,
      operationNumber: p.operationNumber ?? null, authorizationCode: p.authorizationCode ?? null,
      amount: p.amount ?? null, currency: p.currency ?? null, transactionDate: p.transactionDate ?? null,
    } : null,
    tarjeta: s?.paymentInfo?.paymentMethodPayload
      ? { marca: s.paymentInfo.paymentMethodPayload.cardBrand ?? null, numero: s.paymentInfo.paymentMethodPayload.cardNumber ?? null, tipo: s.paymentInfo.paymentMethodType ?? null }
      : null,
  };
}

/**
 * Traduce una sesión de dinelco a `ResultadoPago` (función pura, para los tests).
 * PAGADO solo con `payment.status` APPROVED, la referencia nuestra, PYG y el monto exacto.
 */
export function interpretarSesionDinelco(
  s: any,
  esperado: { referencia: string; monto: number; ahora: Date; expiraEn?: Date | null },
): ResultadoPago {
  const ref = String(s?.clientReferenceId ?? '');
  if (ref !== esperado.referencia) {
    return { tipo: 'INCONSISTENTE', paymentId: null, detalle: `dinelco devolvió otra sesión (${ref || 'sin referencia'})` };
  }
  const p = s?.payment;
  const st = String(p?.status ?? '').toUpperCase();
  const op = p?.operationNumber != null ? String(p.operationNumber) : null;
  const vencido = () => !!esperado.expiraEn && esperado.ahora.getTime() > new Date(esperado.expiraEn).getTime() + GRACIA_VENCIMIENTO_MS;
  switch (st) {
    case 'APPROVED': {
      const moneda = String(p?.currency ?? '').toUpperCase();
      const monto = Number(p?.amount);
      if (!op) return { tipo: 'INCONSISTENTE', paymentId: null, detalle: 'dinelco informa aprobado sin número de operación' };
      if (moneda !== 'PYG') return { tipo: 'INCONSISTENTE', paymentId: op, detalle: `moneda ${moneda || '?'} en vez de PYG` };
      if (!(Math.round(monto) === Math.round(esperado.monto))) {
        return { tipo: 'INCONSISTENTE', paymentId: op, detalle: `dinelco informa ₲ ${p?.amount} y el pedido es ₲ ${esperado.monto}` };
      }
      const tarjeta = s?.paymentInfo?.paymentMethodPayload;
      const t = tarjeta ? ` · ${tarjeta.cardBrand ?? ''} ${tarjeta.cardNumber ?? ''}`.trimEnd() : '';
      return { tipo: 'PAGADO', paymentId: op, monto, detalle: `aprobado en dinelco: operación ${op}, autorización ${p?.authorizationCode ?? '?'}${t}` };
    }
    case 'REJECTED':
      return { tipo: 'FALLIDO', paymentId: op, detalle: `dinelco rechazó el pago${p?.extendedMessage || p?.message ? ': ' + (p.extendedMessage || p.message) : ''}` };
    case 'VOIDED':
      return { tipo: 'INCONSISTENTE', paymentId: op, detalle: `el pago ${op ?? ''} ya está anulado (reversa) en dinelco`.replace('  ', ' ') };
    case 'PROCESSING':
      return { tipo: 'PENDIENTE', detalle: 'dinelco está procesando el pago', paymentId: op };
    case '':
      return vencido() ? { tipo: 'EXPIRADO', detalle: 'sin pago en dinelco y el intento venció' } : { tipo: 'PENDIENTE', detalle: 'dinelco todavía no tiene el pago' };
    default:
      return { tipo: 'PENDIENTE', detalle: `estado de dinelco no reconocido: ${st}` };
  }
}

async function consultarRef(c: DinelcoConfig, f: FetchLike, ref: string, sessionId?: number | null): Promise<{ status: number; body: any }> {
  const r = sessionId
    ? await llamar(c, f, 'GET', `/checkout-session/${encodeURIComponent(String(sessionId))}`)
    : await llamar(c, f, 'GET', `/checkout-session?clientReferenceId=${encodeURIComponent(ref)}`);
  const cred = credencialesRechazadas(r, 'consultar');
  if (cred) throw Object.assign(cred, { crudo: { status: r.status, body: r.body } });
  if (r.status === 404) return { status: 404, body: null };
  if (r.status < 200 || r.status >= 300 || !r.body || typeof r.body !== 'object') {
    throw Object.assign(new ProveedorError('dinelco_error', `dinelco respondió HTTP ${r.status}${mensaje(r.body) ? ' · ' + mensaje(r.body) : ''}`, r.status), { crudo: { status: r.status, body: r.body } });
  }
  return { status: r.status, body: r.body };
}

async function crearSesion(creds: DinelcoConfig, input: CobroInput, ctx: ContextoProveedor): Promise<InicioCobro> {
  const ref = referenciaDinelco(input.procesoNumerico);
  const origen = new URL(input.urlVuelta).origin;
  const r = await llamar(creds, ctx.fetch, 'POST', '/checkout-session', {
    clientReferenceId: ref,
    amount: Math.round(input.monto),
    currency: 'PYG',
    targetOrigin: origen,
    ...(input.urlAviso ? { callbackUrl: input.urlAviso } : {}),
    returnUrl: input.urlVuelta,
    // Sin `customer` (no mandamos datos personales que no hacen falta) ni `lineItems` (no admite
    // descuentos negativos: la suma no cerraría con el total).
    metadata: { pedido: input.descripcion.replace(/^Pedido\s+/i, '').slice(0, 40), intento: String(input.procesoNumerico % 100) },
  });
  const cred = credencialesRechazadas(r, 'crear el cobro');
  if (cred) throw cred;
  const b = r.body;
  if (r.status < 200 || r.status >= 300 || !b?.integrityToken || !b?.sessionId) {
    throw new ProveedorError('dinelco_error', `dinelco no creó el cobro (HTTP ${r.status}${mensaje(b) ? ' · ' + mensaje(b) : ''})`, r.status);
  }
  const tokenVence = b.expirationDate ? new Date(b.expirationDate) : new Date(Date.now() + 10 * 60_000);
  return {
    tipo: 'IFRAME',
    sesionId: String(input.procesoNumerico),
    token: String(b.integrityToken),
    validarUrl: validarUrlDinelco(creds),
    // El intento vence con el de la tienda (default del servicio): el token se renueva aparte.
    expiraEn: null,
    datos: { ref, sessionId: Number(b.sessionId), token: String(b.integrityToken), tokenVence: tokenVence.toISOString(), validarUrl: validarUrlDinelco(creds) },
    // Al historial va SIN el token.
    crudo: { status: r.status, body: { sessionId: b.sessionId, expirationDate: b.expirationDate ?? null, clientReferenceId: ref } },
  };
}

/** Referencias del intento a mirar: la actual y las de tokens renovados. */
function referenciasDe(cobro: CobroGuardado): { ref: string; sessionId: number | null }[] {
  const d = cobro.datos || {};
  const out: { ref: string; sessionId: number | null }[] = [];
  if (typeof d['ref'] === 'string' && REF.test(d['ref'])) out.push({ ref: d['ref'], sessionId: Number(d['sessionId']) || null });
  for (const p of Array.isArray(d['previas']) ? d['previas'] : []) {
    if (p && typeof p.ref === 'string' && REF.test(p.ref)) out.push({ ref: p.ref, sessionId: Number(p.sessionId) || null });
  }
  return out;
}

const proveedor: ProveedorPagoOnline<DinelcoConfig> = {
  id: PROVEEDOR_DINELCO,
  nombre: 'dinelco',
  etiqueta: 'Tarjeta — dinelco',
  medio: 'TARJETA',
  formaPago: FORMA_PAGO_DINELCO,
  hosts: [HOST_DINELCO_PRUEBA, HOST_DINELCO_PRODUCCION],
  modo: 'IFRAME',
  campos: [
    {
      clave: 'entorno', etiqueta: 'Entorno', requerido: true, porDefecto: 'PRUEBA',
      opciones: [{ valor: 'PRUEBA', etiqueta: 'Prueba (test-checkout)' }, { valor: 'PRODUCCION', etiqueta: 'Producción' }],
      ayuda: 'dinelco entrega la clave de producción al terminar el alta del comercio.',
    },
    {
      clave: 'apiKey', etiqueta: 'Clave secreta (di_sk_…)', secreto: true, requerido: true,
      patron: 'di_sk_[A-Za-z0-9_]{20,200}', maxLength: 210,
      ayuda: 'La entrega dinelco. Para anular pagos de pedidos cancelados tiene que tener el permiso payment:reversal.',
    },
  ],

  async credenciales(_ds: DataSource, cfg: TiendaOnlineConfig | null, cuenta?: CuentaPago | null) {
    const v = await valoresCompletos(cfg, proveedor, cuenta);
    if (!v) return null;
    return { apiKey: v['apiKey'], entorno: v['entorno'] === 'PRODUCCION' ? 'PRODUCCION' : 'PRUEBA' };
  },

  iniciar: crearSesion,

  tokenVencido(datos, ahora) {
    const v = datos?.['tokenVence'] ? new Date(datos['tokenVence']).getTime() : NaN;
    return !datos?.['token'] || !Number.isFinite(v) || v - ahora.getTime() < MARGEN_TOKEN_MS;
  },

  async renovar(creds, cobro, input, ctx) {
    // Antes de abrir otra sesión se mira la actual: con un pago aprobado o en proceso, no.
    for (const r of referenciasDe(cobro)) {
      const c = await consultarRef(creds, ctx.fetch, r.ref, r.sessionId);
      const st = String(c.body?.payment?.status ?? '').toUpperCase();
      if (st === 'APPROVED' || st === 'PROCESSING') throw new ProveedorError('pago_en_curso', `la sesión ${r.ref} tiene un pago ${st}`);
    }
    const nueva = await crearSesion(creds, input, ctx);
    if (nueva.tipo !== 'IFRAME') return nueva;
    const d = cobro.datos || {};
    const previas = [
      ...(typeof d['ref'] === 'string' ? [{ ref: d['ref'], sessionId: d['sessionId'] ?? null }] : []),
      ...(Array.isArray(d['previas']) ? d['previas'] : []),
    ].slice(0, MAX_PREVIAS);
    return { ...nueva, datos: { ...nueva.datos, previas } };
  },

  async consultar(creds, cobro, ctx) {
    const ahora = cobro.ahora ?? new Date();
    const refs = referenciasDe(cobro);
    if (!refs.length) throw new ProveedorError('dinelco_error', `intento ${cobro.sesionId} sin referencia de dinelco`);
    const vistos: any[] = [];
    const aprobados: { ref: string; res: ResultadoPago }[] = [];
    let actual: ResultadoPago | null = null;
    for (const [i, r] of refs.entries()) {
      const c = await consultarRef(creds, ctx.fetch, r.ref, r.sessionId);
      if (!c.body) {
        vistos.push({ ref: r.ref, status: 404 });
        if (i === 0) actual = { tipo: 'PENDIENTE', detalle: 'dinelco no encuentra la sesión todavía' };
        continue;
      }
      vistos.push(resumenPago(c.body));
      const res = interpretarSesionDinelco(c.body, { referencia: r.ref, monto: cobro.monto, ahora, expiraEn: cobro.expiraEn });
      if (res.tipo === 'PAGADO') aprobados.push({ ref: r.ref, res });
      if (i === 0) actual = res;
    }
    const crudo = { sesiones: vistos };
    if (aprobados.length > 1) {
      // Dos cobros del mismo intento (pestaña vieja con el token anterior): no se da por pagado
      // solo; el local ve el aviso y devuelve uno en dinelco.
      const ops = aprobados.map((a) => (a.res as any).paymentId).join(' y ');
      return { resultado: { tipo: 'INCONSISTENTE', paymentId: null, detalle: `dinelco aprobó dos cobros del mismo pedido (operaciones ${ops}): devolvé uno desde dinelco` }, crudo };
    }
    if (aprobados.length === 1) return { resultado: aprobados[0].res, crudo };
    // Una sesión vieja rechazada no cambia nada: manda la actual.
    if (actual?.tipo === 'PENDIENTE' && !!cobro.expiraEn && ahora.getTime() > new Date(cobro.expiraEn).getTime() + GRACIA_VENCIMIENTO_MS) {
      return { resultado: { tipo: 'EXPIRADO', detalle: 'sin pago en dinelco y el intento venció' }, crudo };
    }
    return { resultado: actual ?? { tipo: 'PENDIENTE', detalle: 'sin respuesta de dinelco' }, crudo };
  },

  async procesarAviso(creds, body, buscar) {
    // Pago: `clientReferenceId` en la raíz. Reversa: `{ event, data: { clientReferenceId } }`.
    const ref = String(body?.clientReferenceId ?? body?.data?.clientReferenceId ?? '');
    const m = ref.match(REF);
    if (!m) throw new ProveedorError('dinelco_aviso_invalido', 'aviso sin referencia nuestra');
    const sesionId = m[1];
    const cobro = await buscar(sesionId);
    if (!cobro) throw new ProveedorError('dinelco_aviso_desconocido', `intento ${sesionId} sin pedido`);
    // Sin firma: el aviso no decide nada. El servicio consulta esta referencia y aplica.
    return {
      sesionId,
      resultado: { tipo: 'PENDIENTE', detalle: 'aviso de dinelco: se consulta' },
      crudo: { evento: body?.event ?? null, ref, estado: body?.payment?.status ?? body?.data?.paymentStatus ?? null },
      respuesta: { recibido: true },
      datos: { ref },
    };
  },

  async devolver(creds, cobro, ctx) {
    const op = cobro.pagoId;
    if (!op) return { ok: false, detalle: 'sin número de operación de dinelco: devolvelo desde el portal de dinelco' };
    const ref = typeof cobro.datos?.['ref'] === 'string' ? cobro.datos['ref'] : undefined;
    const r = await llamar(creds, ctx.fetch, 'POST', '/payment/reversal', { operationNumber: String(op), ...(ref ? { clientReferenceId: ref } : {}) });
    const b = r.body;
    if (r.status >= 200 && r.status < 300 && String(b?.reversal?.status ?? '').toUpperCase() === 'APPROVED') {
      return { ok: true, detalle: `anulado en dinelco (reversa ${b?.reversal?.id ?? '?'})`, crudo: b };
    }
    const msg = mensaje(b);
    if (/ya ha sido revertido/i.test(msg) && ref) {
      // «No encontrado o ya revertido»: se confirma consultando.
      try {
        const c = await consultarRef(creds, ctx.fetch, ref, Number(cobro.datos?.['sessionId']) || null);
        if (String(c.body?.payment?.status ?? '').toUpperCase() === 'VOIDED') return { ok: true, detalle: 'ya estaba anulado en dinelco', crudo: b };
      } catch { /* sigue: no ok */ }
    }
    return { ok: false, detalle: `dinelco no lo anuló (${msg || 'HTTP ' + r.status}): devolvelo desde el portal de dinelco`, crudo: b ?? r.raw };
  },

  async probarConexion(creds, ctx) {
    // Consulta una referencia que no existe: 404 = la clave sirve.
    try {
      const r = await llamar(creds, ctx.fetch, 'GET', `/checkout-session?clientReferenceId=${encodeURIComponent('FRCG-0-' + randomBytes(4).toString('hex'))}`);
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'dinelco_credenciales', detalle: mensaje(r.body) || undefined };
      if (r.status === 404 || (r.status >= 200 && r.status < 300)) return { ok: true };
      return { ok: false, error: 'dinelco_error', detalle: mensaje(r.body) || `HTTP ${r.status}` };
    } catch (e: any) {
      return { ok: false, error: 'dinelco_sin_conexion', detalle: e?.message || String(e) };
    }
  },

  datosPortal(urlPublica: string, formaId?: number | null) {
    const ruta = formaId ? `dinelco-${formaId}` : 'dinelco';
    return [{ etiqueta: 'URL de aviso (pasásela a dinelco)', valor: `${urlPublica}/pub/pagos/${ruta}/aviso` }];
  },
};

export const dinelcoProveedor = proveedor;

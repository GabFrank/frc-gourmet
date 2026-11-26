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
  /** «Guardar mi tarjeta» (PLAN-tienda-tarjeta-guardada): apagado por defecto. */
  tarjetaGuardada?: boolean;
  /** Tope por pedido del pago con un toque (₲); por encima se paga con el formulario y 3DS. */
  topeTarjetaGuardada?: number;
  /** Pagos con un toque por cliente por día; el siguiente va con el formulario. */
  maxDiaTarjetaGuardada?: number;
}

export const TOPE_TARJETA_GUARDADA_DEF = 300_000;
export const MAX_DIA_TARJETA_GUARDADA_DEF = 3;

export function hostDinelco(c: { entorno: string }): string {
  return c.entorno === 'PRODUCCION' ? HOST_DINELCO_PRODUCCION : HOST_DINELCO_PRUEBA;
}
const api = (c: DinelcoConfig) => `https://${hostDinelco(c)}/dinelco-checkout/api/v1`;
const apiV3 = (c: DinelcoConfig) => `https://${hostDinelco(c)}/dinelco-checkout/api/v3`;
export const validarUrlDinelco = (c: DinelcoConfig) => `https://${hostDinelco(c)}/d/api/checkout-session/validate`;
export const validarRegistroUrlDinelco = (c: DinelcoConfig) => `https://${hostDinelco(c)}/d/api/registry/validate`;
/** Referencia de un catastro: `FRCR-<cuenta de cliente>-<hex>`. */
export const REF_REGISTRO = /^FRCR-(\d{1,12})-([0-9a-f]{6,32})$/;

export function referenciaDinelco(proceso: number, sufijo = randomBytes(3).toString('hex')): string {
  return `FRCG-${proceso}-${sufijo}`;
}

async function llamar(c: DinelcoConfig, f: FetchLike, metodo: 'GET' | 'POST', ruta: string, body?: any, v3 = false): Promise<{ status: number; body: any; raw: string }> {
  const r = await f((v3 ? apiV3(c) : api(c)) + ruta, {
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

async function consultarRef(c: DinelcoConfig, f: FetchLike, ref: string, sessionId?: number | null, token = false): Promise<{ status: number; body: any }> {
  const r = token
    ? await llamar(c, f, 'GET', `/payment/${encodeURIComponent(ref)}`, undefined, true)
    : sessionId
      ? await llamar(c, f, 'GET', `/checkout-session/${encodeURIComponent(String(sessionId))}`)
      : await llamar(c, f, 'GET', `/checkout-session?clientReferenceId=${encodeURIComponent(ref)}`);
  const cred = credencialesRechazadas(r, 'consultar');
  if (cred) throw Object.assign(cred, { crudo: { status: r.status, body: r.body } });
  if (r.status === 404) return { status: 404, body: null };
  if (r.status < 200 || r.status >= 300 || !r.body || typeof r.body !== 'object') {
    throw Object.assign(new ProveedorError('dinelco_error', `dinelco respondió HTTP ${r.status}${mensaje(r.body) ? ' · ' + mensaje(r.body) : ''}`, r.status), { crudo: { status: r.status, body: r.body } });
  }
  return { status: r.status, body: token ? sesionDeCobroToken(r.body) : r.body };
}

/**
 * El pago con token (`/v3/payment`) responde plano; se lleva a la forma de una sesión para
 * interpretarlo con las mismas reglas que el iframe (APPROVED + PYG + monto exacto).
 */
export function sesionDeCobroToken(b: any): any {
  if (!b || typeof b !== 'object') return b;
  return {
    clientReferenceId: b.clientReferenceId ?? null,
    payment: {
      id: b.id ?? null, status: b.status ?? null, message: b.message ?? null, extendedMessage: b.responseCode ? `código ${b.responseCode}` : null,
      operationNumber: b.operationNumber ?? null, authorizationCode: b.authorizationCode ?? null,
      amount: b.amount ?? null, currency: b.currency ?? null, transactionDate: b.transactionDate ?? null,
    },
    paymentInfo: { paymentMethodType: b.paymentMethod?.type ?? null, paymentMethodPayload: { cardBrand: b.paymentMethod?.cardBrand ?? null, cardNumber: b.paymentMethod?.cardNumber ?? null } },
  };
}

// ======================= «Guardar mi tarjeta» (catastro + pago con token) =======================

/** Resultado del catastro, sacado del callback o de la consulta de la sesión (función pura). */
export type ResultadoCatastro =
  | { tipo: 'ACTIVA'; tokenId: string; marca: string | null; enmascarada: string | null; tipoTarjeta: string | null }
  | { tipo: 'FALLIDA'; detalle: string }
  | { tipo: 'PENDIENTE'; detalle: string };

export function interpretarCatastroDinelco(b: any, refEsperada: string): ResultadoCatastro {
  if (!b || typeof b !== 'object') return { tipo: 'PENDIENTE', detalle: 'dinelco todavía no tiene el catastro' };
  const ref = String(b.clientReferenceId ?? '');
  if (ref && ref !== refEsperada) return { tipo: 'PENDIENTE', detalle: `dinelco devolvió otro catastro (${ref})` };
  const info = b.registryInfo ?? b.registry ?? null;
  const st = String(info?.status ?? b.registryStatus ?? '').toUpperCase();
  const pm = info?.paymentMethodInfo ?? null;
  const tokenId = pm?.tokenId != null ? String(pm.tokenId) : '';
  if (st === 'SUCCESSFUL') {
    if (!tokenId || tokenId.length > 80) return { tipo: 'FALLIDA', detalle: 'dinelco confirmó el catastro sin identificador de tarjeta' };
    const pl = pm?.paymentMethodPayload ?? {};
    const corto = (x: any, n: number) => (x == null ? null : String(x).slice(0, n));
    return { tipo: 'ACTIVA', tokenId, marca: corto(pl.cardBrand, 10), enmascarada: corto(pl.cardNumber, 30), tipoTarjeta: corto(pl.cardType, 2) };
  }
  if (st === 'FAILED') return { tipo: 'FALLIDA', detalle: String(b.message || 'dinelco no pudo guardar la tarjeta').slice(0, 250) };
  return { tipo: 'PENDIENTE', detalle: st ? `estado de catastro no reconocido: ${st}` : 'dinelco todavía no tiene el catastro' };
}

/** IPs desde las que dinelco manda los avisos (las informó dinelco el 25/11/2026). */
export const IPS_AVISO_DINELCO: Record<'PRUEBA' | 'PRODUCCION', string[]> = {
  PRODUCCION: ['190.128.216.66', '190.128.216.67'],
  PRUEBA: ['190.128.216.70'],
};

export function ipAvisoDinelco(entorno: string, ip: string): boolean {
  const lista = IPS_AVISO_DINELCO[entorno === 'PRODUCCION' ? 'PRODUCCION' : 'PRUEBA'];
  return lista.includes(String(ip || '').replace(/^::ffff:/i, ''));
}

export function referenciaRegistro(cuentaClienteId: number, sufijo = randomBytes(6).toString('hex')): string {
  return `FRCR-${cuentaClienteId}-${sufijo}`;
}

/** Abre la sesión del catastro embebido (no cobra: monto 0). */
export async function crearSesionCatastro(
  creds: DinelcoConfig, input: { ref: string; targetOrigin: string; urlAviso?: string; urlVuelta?: string }, ctx: ContextoProveedor,
): Promise<{ sessionId: string; token: string; validarUrl: string; expiraEn: string | null }> {
  const r = await llamar(creds, ctx.fetch, 'POST', '/checkout-session/registry', {
    clientReferenceId: input.ref,
    amount: 0,
    currency: 'PYG',
    targetOrigin: input.targetOrigin,
    ...(input.urlAviso ? { callbackUrl: input.urlAviso } : {}),
    ...(input.urlVuelta ? { returnUrl: input.urlVuelta } : {}),
    // Sin `customer`: no mandamos datos personales que no hacen falta.
  });
  const cred = credencialesRechazadas(r, 'guardar la tarjeta');
  if (cred) throw cred;
  const b = r.body;
  if (r.status < 200 || r.status >= 300 || !b?.integrityToken || !b?.sessionId) {
    throw new ProveedorError('dinelco_error', `dinelco no abrió el catastro (HTTP ${r.status}${mensaje(b) ? ' · ' + mensaje(b) : ''})`, r.status);
  }
  return { sessionId: String(b.sessionId), token: String(b.integrityToken), validarUrl: validarRegistroUrlDinelco(creds), expiraEn: b.expirationDate ?? null };
}

/**
 * Consulta la sesión del catastro. `GET /checkout-session/{id}` no trae el token de la tarjeta
 * (PLAN §6.1, probado): `exitosa` dice si dinelco da esa sesión por terminada bien, para el callback.
 */
export async function consultarCatastro(
  creds: DinelcoConfig, ref: string, sessionId: string | null, ctx: ContextoProveedor,
): Promise<{ resultado: ResultadoCatastro; exitosa: boolean; crudo: any }> {
  const c = await consultarRef(creds, ctx.fetch, ref, sessionId ? Number(sessionId) || null : null);
  const resultado = interpretarCatastroDinelco(c.body, ref);
  // Al registro va sin el token.
  const b = c.body || {};
  // dinelco no devuelve el token por consulta (probado en su sandbox el 26/11): sí confirma que la
  // sesión de ESE catastro terminó bien (`sessionStatus: SUCCESS`). Con eso se acepta el callback.
  const mismaRef = !b.clientReferenceId || String(b.clientReferenceId) === ref;
  const mismaSesion = !sessionId || b.sessionId == null || String(b.sessionId) === String(sessionId);
  const exitosa = c.status >= 200 && c.status < 300 && mismaRef && mismaSesion && String(b.sessionStatus ?? '').toUpperCase() === 'SUCCESS';
  return { resultado, exitosa, crudo: { status: c.status, sessionStatus: b.sessionStatus ?? null, registro: b.registryInfo?.status ?? null } };
}

/**
 * Cobra con la tarjeta guardada (`POST /v3/payment`, permiso `payment:create`). La referencia
 * tiene que estar guardada ANTES de llamar: si no hay respuesta, se consulta con ella y nunca se
 * cobra de nuevo sin consultar.
 */
export async function cobrarConToken(
  creds: DinelcoConfig, input: { ref: string; monto: number; tokenId: string; pedido: string; intento: number }, ctx: ContextoProveedor,
): Promise<{ sesion: any; crudo: any }> {
  const r = await llamar(creds, ctx.fetch, 'POST', '/payment', {
    clientReferenceId: input.ref,
    amount: Math.round(input.monto),
    currency: 'PYG',
    paymentMethod: { tokenId: input.tokenId },
    paymentOptions: {},
    metadata: { pedido: input.pedido.slice(0, 40), intento: String(input.intento) },
  }, true);
  const cred = credencialesRechazadas(r, 'cobrar con la tarjeta guardada');
  if (cred) throw Object.assign(cred, { crudo: { status: r.status, body: r.body } });
  const b = r.body;
  if (r.status >= 200 && r.status < 300 && b && typeof b === 'object' && b.status) {
    const sesion = sesionDeCobroToken(b);
    return { sesion, crudo: resumenPago(sesion) };
  }
  // Rechazo de validación (400/422) con el estado en el cuerpo: se interpreta igual.
  if (b && typeof b === 'object' && /^(APPROVED|REJECTED)$/i.test(String(b.status ?? ''))) {
    const sesion = sesionDeCobroToken(b);
    return { sesion, crudo: resumenPago(sesion) };
  }
  throw Object.assign(new ProveedorError('dinelco_error', `dinelco no respondió el cobro (HTTP ${r.status}${mensaje(b) ? ' · ' + mensaje(b) : ''})`, r.status), { crudo: { status: r.status, body: b } });
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

/** Referencias del intento a mirar: la actual y las de tokens renovados (o del cobro con un toque). */
function referenciasDe(cobro: CobroGuardado): { ref: string; sessionId: number | null; token: boolean }[] {
  const d = cobro.datos || {};
  const out: { ref: string; sessionId: number | null; token: boolean }[] = [];
  if (typeof d['ref'] === 'string' && REF.test(d['ref'])) out.push({ ref: d['ref'], sessionId: Number(d['sessionId']) || null, token: d['modo'] === 'TOKEN' });
  for (const p of Array.isArray(d['previas']) ? d['previas'] : []) {
    if (p && typeof p.ref === 'string' && REF.test(p.ref)) out.push({ ref: p.ref, sessionId: Number(p.sessionId) || null, token: p.token === true });
  }
  return out;
}

/** La referencia actual del intento como entrada de `previas` (para no perderla al cambiar de sesión). */
export function previaDe(datos: Record<string, any> | null | undefined): { ref: string; sessionId: number | null; token?: true }[] {
  const d = datos || {};
  return typeof d['ref'] === 'string'
    ? [{ ref: d['ref'], sessionId: d['sessionId'] ?? null, ...(d['modo'] === 'TOKEN' ? { token: true as const } : {}) }]
    : [];
}

/** ¿Alguna sesión del intento tiene un pago aprobado o en proceso? (antes de abrir otra o cobrar con token). */
export async function pagoEnCursoDinelco(creds: DinelcoConfig, datos: Record<string, any> | null, ctx: ContextoProveedor): Promise<string | null> {
  for (const r of referenciasDe({ sesionId: '', referencia: '', monto: 0, datos })) {
    const c = await consultarRef(creds, ctx.fetch, r.ref, r.sessionId, r.token);
    const st = String(c.body?.payment?.status ?? '').toUpperCase();
    if (st === 'APPROVED' || st === 'PROCESSING') return `la sesión ${r.ref} tiene un pago ${st}`;
  }
  return null;
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
    {
      clave: 'tarjetaGuardada', etiqueta: 'Permitir guardar tarjetas (pago con un toque)', porDefecto: 'NO',
      opciones: [{ valor: 'NO', etiqueta: 'No' }, { valor: 'SI', etiqueta: 'Sí' }],
      ayuda: 'El cliente guarda su tarjeta en dinelco y paga los próximos pedidos con un toque. La clave necesita el permiso payment:create.',
    },
    {
      clave: 'topeTarjetaGuardada', etiqueta: 'Tope por pedido con un toque (₲)', porDefecto: String(TOPE_TARJETA_GUARDADA_DEF),
      patron: '\\d{1,9}', maxLength: 9,
      ayuda: 'Más que esto, o a una dirección nueva, se paga con el formulario y la verificación del banco.',
    },
    {
      clave: 'maxDiaTarjetaGuardada', etiqueta: 'Pagos con un toque por cliente por día', porDefecto: String(MAX_DIA_TARJETA_GUARDADA_DEF),
      patron: '\\d{1,3}', maxLength: 3,
    },
  ],

  async credenciales(_ds: DataSource, cfg: TiendaOnlineConfig | null, cuenta?: CuentaPago | null) {
    const v = await valoresCompletos(cfg, proveedor, cuenta);
    if (!v) return null;
    const entero = (x: string | undefined, def: number) => (/^\d{1,9}$/.test(String(x ?? '')) ? Number(x) : def);
    return {
      apiKey: v['apiKey'],
      entorno: v['entorno'] === 'PRODUCCION' ? 'PRODUCCION' : 'PRUEBA',
      tarjetaGuardada: v['tarjetaGuardada'] === 'SI',
      topeTarjetaGuardada: entero(v['topeTarjetaGuardada'], TOPE_TARJETA_GUARDADA_DEF),
      maxDiaTarjetaGuardada: entero(v['maxDiaTarjetaGuardada'], MAX_DIA_TARJETA_GUARDADA_DEF),
    };
  },

  iniciar: crearSesion,

  tokenVencido(datos, ahora) {
    const v = datos?.['tokenVence'] ? new Date(datos['tokenVence']).getTime() : NaN;
    return !datos?.['token'] || !Number.isFinite(v) || v - ahora.getTime() < MARGEN_TOKEN_MS;
  },

  async renovar(creds, cobro, input, ctx) {
    // Antes de abrir otra sesión se mira la actual: con un pago aprobado o en proceso, no.
    const enCurso = await pagoEnCursoDinelco(creds, cobro.datos ?? null, ctx);
    if (enCurso) throw new ProveedorError('pago_en_curso', enCurso);
    const nueva = await crearSesion(creds, input, ctx);
    if (nueva.tipo !== 'IFRAME') return nueva;
    const d = cobro.datos || {};
    const previas = [...previaDe(d), ...(Array.isArray(d['previas']) ? d['previas'] : [])].slice(0, MAX_PREVIAS);
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
      const c = await consultarRef(creds, ctx.fetch, r.ref, r.sessionId, r.token);
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
        const c = await consultarRef(creds, ctx.fetch, ref, Number(cobro.datos?.['sessionId']) || null, cobro.datos?.['modo'] === 'TOKEN');
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
      if (!(r.status === 404 || (r.status >= 200 && r.status < 300))) return { ok: false, error: 'dinelco_error', detalle: mensaje(r.body) || `HTTP ${r.status}` };
      if (!creds.tarjetaGuardada) return { ok: true };
      // Con «guardar tarjetas»: la clave tiene que poder usar /v3/payment (permiso payment:create).
      const v = await llamar(creds, ctx.fetch, 'GET', `/payment/${encodeURIComponent('FRCG-0-' + randomBytes(4).toString('hex'))}`, undefined, true);
      if (v.status === 401 || v.status === 403) {
        return { ok: false, error: 'dinelco_sin_permiso_tarjeta', detalle: 'la clave no tiene el permiso payment:create: pedíselo a dinelco o apagá «guardar tarjetas»' };
      }
      return { ok: true };
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
export { MAX_PREVIAS as MAX_PREVIAS_DINELCO };

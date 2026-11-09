/**
 * IC Pay (IC Investments S.A.) como proveedor: Pix de Brasil (PLAN-tienda-pagos-multi-icpay §3).
 *
 * API «IC Investments API» (OpenAPI en https://www.developer.ic.com.py/openapi.json):
 * - Cada llamada lleva `x-api-key` + `Authorization: Bearer <accessToken>`. El token sale del
 *   sign-in con email y contraseña y dura 1 h; se renueva con el refresh (ver `icpay-auth.ts`).
 * - El cobro es una «orden de pago» en **dólares**: IC la convierte a reales con su cotización y
 *   devuelve el QR Pix dinámico (`qrData.payload`, EMV) y lo que paga el cliente (`totalAmount`).
 *   El monto en USD lo calculamos desde los guaraníes del pedido con la cotización de IC
 *   (PYG→USD, contexto `payment_order`), redondeando hacia arriba para no cobrar de menos.
 * - No hay aviso (webhook) de órdenes de pago: la confirmación sale de consultar la orden (la
 *   página de pago mientras el cliente mira, y el job). No hay devolución por API.
 * - La orden no acepta una referencia nuestra: se correlaciona por su `id` (= sesión del intento).
 */
import { DataSource } from 'typeorm';
import { FORMA_PAGO_ICPAY } from '../../../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { TiendaOnlineConfig } from '../../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { ResultadoPago } from '../interpretar-pago';
import { valoresCompletos } from './config-proveedor';
import { IcpayConfig, icpayLlamar, normalizarApiKey, normalizarBaseIcpay } from './icpay-auth';
import { CuentaPago, ProveedorError, ProveedorPagoOnline } from './tipos';

export const PROVEEDOR_ICPAY = 'ICPAY';

/** Una orden pendiente pasado su vencimiento por más de esto se da por vencida. */
const GRACIA_VENCIMIENTO_MS = 15 * 60_000;
/** Diferencia tolerada entre el USD pedido y el que informa IC (redondeo a centavos). */
const TOLERANCIA_USD = 0.005;
/** Cuántas veces se sube un centavo si IC devuelve una orden de otro pedido. */
const MAX_AJUSTES_MONTO = 10;

/** «5.64», «541,24», 5.64 → número; NaN si no se entiende. */
export function montoIcpay(v: any): number {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else s = s.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Guaraníes → USD con la tasa «guaraníes por dólar», redondeado hacia arriba a centavos. */
export function usdDesdeGuaranies(guaranies: number, pygPorUsd: number): number {
  if (!(guaranies > 0) || !(pygPorUsd > 0)) return NaN;
  return Math.ceil(Math.round((guaranies / pygPorUsd) * 1e6) / 1e4) / 100;
}

/** Traduce una orden de IC a `ResultadoPago` (función pura, para los tests). */
export function interpretarOrdenIcpay(
  o: any,
  esperado: { sesionId: string; usd: number | null; ahora: Date; expiraEn?: Date | null },
): ResultadoPago {
  const st = String(o?.status ?? '').toLowerCase();
  const id = o?.id != null ? String(o.id) : null;
  if (!id || id !== esperado.sesionId) {
    return { tipo: 'INCONSISTENTE', paymentId: id, detalle: `IC devolvió otra orden (${id ?? 'sin id'})` };
  }
  const usd = montoIcpay(o?.amount);
  const moneda = String(o?.currency ?? '').toUpperCase();
  const vence = o?.qrData?.expiresAt ? new Date(o.qrData.expiresAt) : esperado.expiraEn ?? null;
  switch (st) {
    case 'completed': {
      if (esperado.usd == null) return { tipo: 'INCONSISTENTE', paymentId: id, detalle: 'IC informa cobrado pero falta el monto del intento' };
      if (moneda !== 'BRL') return { tipo: 'INCONSISTENTE', paymentId: id, detalle: `moneda ${moneda || '?'} en vez de BRL` };
      if (!(Math.abs(usd - esperado.usd) < TOLERANCIA_USD)) {
        return { tipo: 'INCONSISTENTE', paymentId: id, detalle: `IC informa US$ ${o?.amount} y el intento era US$ ${esperado.usd.toFixed(2)}` };
      }
      return { tipo: 'PAGADO', paymentId: id, monto: NaN, detalle: `Pix cobrado por IC: R$ ${o?.totalAmount ?? '?'} (US$ ${usd.toFixed(2)})` };
    }
    case 'pending': {
      const vencida = vence && esperado.ahora.getTime() > vence.getTime() + GRACIA_VENCIMIENTO_MS;
      return vencida ? { tipo: 'EXPIRADO', detalle: 'el QR Pix venció sin pago' } : { tipo: 'PENDIENTE', detalle: 'IC espera el Pix' };
    }
    case 'expired': return { tipo: 'EXPIRADO', detalle: 'IC informa la orden vencida' };
    case 'cancelled': return { tipo: 'FALLIDO', paymentId: id, detalle: 'IC canceló la orden' };
    case 'underpaid': return { tipo: 'INCONSISTENTE', paymentId: id, detalle: `IC informa pago incompleto (falta ${o?.pendingAmount ?? '?'})` };
    case 'duplicated': return { tipo: 'INCONSISTENTE', paymentId: id, detalle: 'IC marca la orden como duplicada' };
    case 'under_dispute': return { tipo: 'INCONSISTENTE', paymentId: id, detalle: 'la orden tiene un reclamo abierto en IC' };
    case 'refunded': return { tipo: 'INCONSISTENTE', paymentId: id, detalle: 'IC informa la orden devuelta' };
    default: return { tipo: 'PENDIENTE', detalle: `estado de IC no reconocido: ${st || 'vacío'}` };
  }
}

function jsonDe(r: { status: number; body: any }, que: string): any {
  if (r.status === 401 || r.status === 403) throw new ProveedorError('icpay_credenciales', `IC rechazó las credenciales al ${que} (HTTP ${r.status})`, r.status);
  if (r.status < 200 || r.status >= 300 || !r.body || typeof r.body !== 'object') {
    const msg = r.body?.message ? ` · ${Array.isArray(r.body.message) ? r.body.message.join(', ') : r.body.message}` : '';
    throw new ProveedorError('icpay_error', `IC no pudo ${que} (HTTP ${r.status}${msg})`, r.status);
  }
  return r.body;
}

const proveedor: ProveedorPagoOnline<IcpayConfig> = {
  id: PROVEEDOR_ICPAY,
  nombre: 'IC Pay',
  etiqueta: 'Pix (Brasil)',
  medio: 'PIX',
  formaPago: FORMA_PAGO_ICPAY,
  // El QR se dibuja en la tienda: no se redirige ni se carga nada de IC en el navegador.
  hosts: [],
  modo: 'QR',
  campos: [
    {
      clave: 'baseUrl', etiqueta: 'URL de la API', requerido: true, patron: 'https://[A-Za-z0-9.-]+(:\\d+)?(/[A-Za-z0-9._/-]*)?', maxLength: 200,
      porDefecto: 'https://stage.api.ic.com.py', ayuda: 'Sandbox: https://stage.api.ic.com.py. La de producción la da IC.',
    },
    { clave: 'email', etiqueta: 'Usuario (email)', requerido: true, patron: '[^\\s@]+@[^\\s@]+', maxLength: 150, ayuda: 'Usuario «store» de IC, sin MFA y con la contraseña definitiva.' },
    { clave: 'apiKey', etiqueta: 'API key', secreto: true, requerido: true, maxLength: 200 },
    { clave: 'password', etiqueta: 'Contraseña', secreto: true, requerido: true, maxLength: 200 },
  ],

  async credenciales(_ds: DataSource, cfg: TiendaOnlineConfig | null, cuenta?: CuentaPago | null) {
    const v = await valoresCompletos(cfg, proveedor, cuenta);
    if (!v) return null;
    return { baseUrl: normalizarBaseIcpay(v['baseUrl']), email: v['email'], apiKey: normalizarApiKey(v['apiKey']), password: v['password'] };
  },

  async iniciar(creds, input, ctx) {
    const q = jsonDe(await icpayLlamar(creds, ctx.fetch, 'GET', '/api/v1/quote?fromCurrency=PYG&toCurrency=USD&context=payment_order'), 'cotizar');
    const base = Number(q?.data?.baseExchangeRate);
    const inv = Number(q?.data?.targetExchangeRate);
    const pygPorUsd = base > 0 ? base : inv > 0 ? 1 / inv : NaN;
    const usd = usdDesdeGuaranies(input.monto, pygPorUsd);
    if (!(usd >= 0.01)) throw new ProveedorError('icpay_cotizacion', `cotización de IC inválida (${q?.data?.baseExchangeRate ?? 'sin tasa'})`);

    // IC trata dos órdenes del mismo monto como la misma (responde la existente aunque la
    // Idempotency-Key sea otra, 2026-11-09). Si la que devuelve ya es de otro pedido, se pide con un
    // centavo de dólar más, hasta conseguir una propia. Sin esto, dos clientes con el mismo total
    // compartirían el QR.
    let usdFinal = usd;
    let o: any = null;
    for (let i = 0; i < MAX_AJUSTES_MONTO; i++) {
      o = jsonDe(
        await icpayLlamar(creds, ctx.fetch, 'POST', '/api/v1/payment/order', { amount: usdFinal.toFixed(2), currency: 'BRL' },
          { 'Idempotency-Key': i ? `${input.idempotencyKey}:${i}` : input.idempotencyKey }),
        'crear la orden',
      );
      if (!o?.id || !ctx.sesionUsada || !(await ctx.sesionUsada(String(o.id)))) break;
      o = null;
      usdFinal = Math.round((usdFinal + 0.01) * 100) / 100;
    }
    if (!o) throw new ProveedorError('icpay_orden_repetida', `IC devolvió órdenes de otros pedidos ${MAX_AJUSTES_MONTO} veces`);
    const payload = String(o?.qrData?.payload ?? '');
    if (!o?.id || !payload) throw new ProveedorError('icpay_error', 'IC creó la orden sin QR');
    const expira = o.qrData?.expiresAt ? new Date(o.qrData.expiresAt) : null;
    const qr = { payload, moneda: 'BRL', monto: String(o.totalAmount ?? ''), expiraEn: expira ? expira.toISOString() : null };
    return {
      tipo: 'QR',
      sesionId: String(o.id),
      qr,
      expiraEn: expira,
      datos: { qr, usd: usdFinal.toFixed(2), pygPorUsd, cotizacionBrl: o.quote ?? null, ...(usdFinal !== usd ? { usdCalculado: usd.toFixed(2) } : {}) },
      crudo: { status: o.status, id: o.id, amount: o.amount, totalAmount: o.totalAmount, quote: o.quote, pygPorUsd, expiresAt: o.qrData?.expiresAt ?? null, ...(usdFinal !== usd ? { usdCalculado: usd.toFixed(2) } : {}) },
    };
  },

  async consultar(creds, cobro, ctx) {
    const r = await icpayLlamar(creds, ctx.fetch, 'GET', `/api/v1/payment/order/${encodeURIComponent(cobro.sesionId)}`);
    const o = jsonDe(r, 'consultar la orden');
    const usd = cobro.datos?.usd != null ? montoIcpay(cobro.datos.usd) : null;
    const resultado = interpretarOrdenIcpay(o, { sesionId: cobro.sesionId, usd: usd != null && !isNaN(usd) ? usd : null, ahora: cobro.ahora ?? new Date(), expiraEn: cobro.expiraEn ?? null });
    // El servicio guarda en el pedido el monto en guaraníes: el del pedido.
    if (resultado.tipo === 'PAGADO') resultado.monto = cobro.monto;
    // Del pagador solo el nombre (el CPF no se guarda).
    const crudo = { status: o.status, id: o.id, amount: o.amount, totalAmount: o.totalAmount, currency: o.currency, completedAt: o.completedAt ?? null, pagador: o.providerMetadata?.payerName ?? null };
    return { resultado, crudo };
  },

  async probarConexion(creds, ctx) {
    try {
      const st = jsonDe(await icpayLlamar(creds, ctx.fetch, 'GET', '/api/v1/store/me'), 'leer el comercio');
      const cuenta = await icpayLlamar(creds, ctx.fetch, 'GET', '/api/v1/account/me');
      const moneda = cuenta.status === 200 ? cuenta.body?.data?.currency : null;
      return { ok: true, detalle: `Conectado como ${st?.name ?? 'comercio'}${moneda ? ` (cuenta en ${moneda})` : ''}` };
    } catch (e: any) {
      return { ok: false, error: e instanceof ProveedorError ? e.codigo : 'icpay_sin_conexion', detalle: e?.message || String(e) };
    }
  },
};

export const icpayProveedor = proveedor;

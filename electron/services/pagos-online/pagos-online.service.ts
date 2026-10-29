/**
 * Pago online de pedidos de la tienda con uPay (PLAN-tienda-online F4).
 *
 * - `iniciarPagoPedido`: crea (o reusa) la sesión de checkout del intento actual.
 * - `verificarPagoPedido`: consulta a uPay y aplica el resultado. ÚNICA puerta para dar un
 *   pedido por pagado (nunca el retorno del navegador). Idempotente: el cambio se hace con
 *   un UPDATE condicionado al estado anterior, así dos verificaciones a la vez no duplican.
 * - `tickPagosOnline`: lo llama el job del proceso principal (cada 60 s) para los pedidos
 *   en espera, los pagos tardíos y el aviso de pagado-sin-aceptar. Corre aunque
 *   `pagoOnlineActivo` esté apagado: apagarlo solo deja de ofrecer el pago a pedidos nuevos.
 */
import { randomUUID } from 'crypto';
import { Brackets, DataSource, In, IsNull, Not } from 'typeorm';
import { PedidoOnline } from '../../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { PagoOnlineEvento } from '../../../src/app/database/entities/pedidos-online/pago-online-evento.entity';
import { TiendaOnlineConfig } from '../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import {
  EstadoPagoOnline,
  EstadoPedidoOnline,
  MetodoPagoOnline,
} from '../../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { FetchLike, UpayCheckoutProvider, UpayConfig, UpayError, UPAY_STG_BASE_URL } from './upay-checkout.provider';
import { interpretarPago, interpretarSesion, ResultadoPago } from './interpretar-pago';

export const PROVEEDOR_UPAY = 'UPAY';
/** Mínimo entre consultas a uPay por pedido desde el endpoint público. */
export const VERIFICAR_MIN_MS = 10_000;
const URL_PUBLICA_DEF = 'https://app.frc-gourmet.com';

// ── Dependencias inyectables (tests) ──
type Avisar = (texto: string, dedupe: string) => Promise<void>;
type ApiKeyFn = () => Promise<string>;
let fetchOverride: FetchLike | null = null;
let apiKeyOverride: ApiKeyFn | null = null;
let avisarOverride: Avisar | null = null;
export function setPagosOnlineDeps(d: { fetch?: FetchLike | null; apiKey?: ApiKeyFn | null; avisar?: Avisar | null }): void {
  if (d.fetch !== undefined) fetchOverride = d.fetch;
  if (d.apiKey !== undefined) apiKeyOverride = d.apiKey;
  if (d.avisar !== undefined) avisarOverride = d.avisar;
}

/** API Key de uPay vigente (almacén seguro, o la de prueba inyectada). */
export async function apiKey(): Promise<string> {
  if (apiKeyOverride) return apiKeyOverride();
  const { getUpayApiKey } = await import('../../utils/tienda-secrets.util');
  return getUpayApiKey();
}

async function avisarPersonal(texto: string, dedupe: string): Promise<void> {
  try {
    if (avisarOverride) return await avisarOverride(texto, dedupe);
    const { dispatchEvento } = await import('../notificacion.service');
    await dispatchEvento('TIENDA_PAGO_ONLINE', { asunto: 'Tienda online: pago con tarjeta', texto, dedupeKey: dedupe });
  } catch (e: any) {
    console.warn('[pagos-online] aviso al personal falló:', e?.message || e);
  }
}

async function getCfg(ds: DataSource): Promise<TiendaOnlineConfig | null> {
  return ds.getRepository(TiendaOnlineConfig).findOne({ where: {}, order: { id: 'ASC' } });
}

/** Config completa para hablar con uPay, o null si falta algo. */
export async function upayConfigDe(ds: DataSource, cfg?: TiendaOnlineConfig | null): Promise<UpayConfig | null> {
  const c = cfg === undefined ? await getCfg(ds) : cfg;
  const key = await apiKey();
  if (!c || !key || !c.upayMerchantId) return null;
  return {
    baseUrl: c.upayBaseUrl || UPAY_STG_BASE_URL,
    apiKey: key,
    merchantId: c.upayMerchantId,
    merchantNombre: c.upayMerchantNombre || c.nombreComercio || 'Tienda',
  };
}

/** ¿Se ofrece «Pagar con tarjeta» a pedidos nuevos? */
export async function pagoOnlineDisponible(ds: DataSource, cfg?: TiendaOnlineConfig | null): Promise<boolean> {
  const c = cfg === undefined ? await getCfg(ds) : cfg;
  return !!c?.pagoOnlineActivo && !!(await upayConfigDe(ds, c));
}

function proveedor(u: UpayConfig): UpayCheckoutProvider {
  return new UpayCheckoutProvider(u, fetchOverride || (globalThis as any).fetch);
}

async function registrar(ds: DataSource, p: { id: number; pagoIntento?: number | null }, tipo: string, estado: string | null, resp?: any) {
  try {
    const raw = resp == null ? null : typeof resp === 'string' ? resp : JSON.stringify(resp);
    await ds.getRepository(PagoOnlineEvento).insert({
      pedidoOnlineId: p.id,
      intento: p.pagoIntento ?? null,
      tipo,
      estadoProveedor: estado ? estado.slice(0, 60) : null,
      respuesta: raw ? raw.slice(0, 4000) : null,
    } as any);
  } catch (e: any) {
    console.warn('[pagos-online] no se pudo registrar el evento:', e?.message || e);
  }
}

const referencia = (p: PedidoOnline) => `${p.numero}-${p.pagoIntento ?? 1}`;
const gs = (n: number) => '₲' + Math.round(n).toLocaleString('es-PY');

/**
 * Crea la sesión del intento actual. `nuevoIntento` (reintento tras FALLIDO) abre otra sesión.
 * Devuelve la URL a la que el storefront redirige.
 */
export async function iniciarPagoPedido(
  ds: DataSource,
  pedidoId: number,
  opts: { nuevoIntento?: boolean; urlPublica?: string } = {},
): Promise<{ success: true; checkoutUrl: string } | { success: false; error: string }> {
  const repo = ds.getRepository(PedidoOnline);
  const p = await repo.findOne({
    where: { id: pedidoId },
    relations: ['items'],
    select: undefined as any,
  });
  if (!p) return { success: false, error: 'pedido_no_encontrado' };
  const extra = await repo.createQueryBuilder('p').addSelect(['p.pagoIdemKey', 'p.pagoCheckoutUrl']).where('p.id = :id', { id: p.id }).getOne();
  p.pagoIdemKey = extra?.pagoIdemKey ?? null;
  p.pagoCheckoutUrl = extra?.pagoCheckoutUrl ?? null;

  if (p.metodoPago !== MetodoPagoOnline.UPAY || p.estado !== EstadoPedidoOnline.PENDIENTE_PAGO) {
    return { success: false, error: 'pedido_no_espera_pago' };
  }
  if (p.estadoPago === EstadoPagoOnline.PAGADO) return { success: false, error: 'pedido_ya_pagado' };
  const u = await upayConfigDe(ds);
  if (!u) return { success: false, error: 'pago_online_no_disponible' };

  // Sesión vigente del mismo intento: se reusa (doble clic, reintento de red).
  const vigente = p.pagoSesionId && p.pagoCheckoutUrl && p.estadoPago === EstadoPagoOnline.PENDIENTE
    && (!p.pagoExpiraEn || new Date(p.pagoExpiraEn).getTime() > Date.now() + 60_000);
  if (vigente && !opts.nuevoIntento) return { success: true, checkoutUrl: p.pagoCheckoutUrl! };

  // Hay sesión: un intento nuevo solo si la anterior FALLÓ. Con una abierta (que todavía se
  // puede pagar) no se abre otra: cobraría dos veces.
  let intento = p.pagoIntento ?? 1;
  let idem = p.pagoIdemKey || randomUUID(); // sin sesión todavía: reintento de red = misma clave
  if (p.pagoSesionId) {
    if (p.estadoPago !== EstadoPagoOnline.FALLIDO) return { success: false, error: 'pago_en_curso' };
    intento += 1;
    idem = randomUUID();
    // F5 (auditoría A-pay3): se RECLAMA el intento con un UPDATE condicionado. Dos reintentos a
    // la vez abrían dos sesiones en uPay y la que no quedaba guardada seguía siendo pagable.
    const claim = await repo.createQueryBuilder().update(PedidoOnline)
      .set({
        pagoIntento: intento, pagoIdemKey: idem, pagoProveedor: PROVEEDOR_UPAY,
        estadoPago: EstadoPagoOnline.PENDIENTE, pagoSesionId: null, pagoCheckoutUrl: null,
      } as any)
      .where('id = :id AND estado_pago = :fal AND pago_sesion_id = :ses AND COALESCE(pago_intento, 1) = :prev', {
        id: p.id, fal: EstadoPagoOnline.FALLIDO, ses: p.pagoSesionId, prev: p.pagoIntento ?? 1,
      })
      .execute();
    if (!claim.affected) return { success: false, error: 'pago_en_curso' };
  } else {
    await repo.update({ id: p.id }, { pagoIntento: intento, pagoIdemKey: idem, pagoProveedor: PROVEEDOR_UPAY } as any);
  }
  p.pagoIntento = intento;

  // F5 (M-pay3): la URL pública de vuelta se puede cambiar por entorno (otro dominio o una
  // instalación de prueba); solo https.
  const delEntorno = String(process.env['FRC_TIENDA_URL_PUBLICA'] || '').trim();
  const base = (opts.urlPublica || (/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(delEntorno) ? delEntorno : URL_PUBLICA_DEF)).replace(/\/+$/, '');
  const vuelta = `${base}/tienda/pago/${encodeURIComponent(p.numero)}`;
  try {
    const r = await proveedor(u).crearSesion({
      referencia: referencia(p),
      idempotencyKey: idem,
      monto: Number(p.total),
      successUrl: vuelta + '?r=ok',
      failureUrl: vuelta + '?r=error',
      items: [
        ...(p.items || []).map((it) => ({
          name: [it.nombreProducto, it.nombrePresentacion].filter(Boolean).join(' '),
          quantity: Number(it.cantidad),
          unitPrice: Number(it.subtotal) / Math.max(1, Number(it.cantidad)),
        })),
        ...(Number(p.costoEnvio) > 0 ? [{ name: 'Envío', quantity: 1, unitPrice: Number(p.costoEnvio) }] : []),
      ],
    });
    await repo.update({ id: p.id }, {
      pagoSesionId: r.sessionId,
      pagoCheckoutUrl: r.checkoutUrl,
      pagoExpiraEn: r.expiresAt ?? new Date(Date.now() + 2 * 3600_000),
      estadoPago: EstadoPagoOnline.PENDIENTE,
      pagoDetalle: null,
    } as any);
    await registrar(ds, p, 'SESION_CREADA', null, r.resp.raw);
    return { success: true, checkoutUrl: r.checkoutUrl };
  } catch (e: any) {
    await registrar(ds, p, 'ERROR', e instanceof UpayError ? e.codigo : 'error', e?.message || String(e));
    return { success: false, error: e instanceof UpayError ? e.codigo : 'upay_error' };
  }
}

export interface VerificacionResultado {
  success: boolean;
  error?: string;
  estado?: string;
  estadoPago?: string | null;
  /** El pedido acaba de pasar a pagado y entra al flujo normal (el caller materializa si corresponde). */
  recienPagado?: boolean;
  aceptadoAutomatico?: boolean;
}

/**
 * Consulta a uPay y aplica. `minIntervaloMs` evita martillar la API desde el endpoint público:
 * si la última consulta es más reciente, devuelve el estado guardado.
 */
export async function verificarPagoPedido(
  ds: DataSource,
  pedidoId: number,
  opts: { minIntervaloMs?: number; ahora?: Date } = {},
): Promise<VerificacionResultado> {
  const repo = ds.getRepository(PedidoOnline);
  const ahora = opts.ahora ?? new Date();
  const p = await repo.findOne({ where: { id: pedidoId } });
  if (!p) return { success: false, error: 'pedido_no_encontrado' };
  const actual = { success: true, estado: p.estado, estadoPago: p.estadoPago ?? null };
  if (!p.pagoSesionId || p.estadoPago === EstadoPagoOnline.PAGADO || p.estadoPago === EstadoPagoOnline.DEVUELTO
    || p.estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE) return actual;
  if (opts.minIntervaloMs && p.pagoUltimaConsulta
    && ahora.getTime() - new Date(p.pagoUltimaConsulta).getTime() < opts.minIntervaloMs) return actual;

  const u = await upayConfigDe(ds);
  if (!u) return { ...actual, error: 'pago_online_no_configurado' };
  await repo.update({ id: p.id }, { pagoUltimaConsulta: ahora } as any);

  let res: ResultadoPago;
  let crudo: any = null;
  try {
    const prov = proveedor(u);
    const s = await prov.consultarSesion(p.pagoSesionId);
    crudo = { sesion: s.body ?? s.raw, status: s.status };
    if (s.status === 401 || s.status === 403) throw new UpayError('upay_credenciales', 'API Key rechazada', s.status);
    if (s.status < 200 || s.status >= 300) throw new UpayError('upay_error', `HTTP ${s.status}`, s.status);
    const ses = interpretarSesion(s.body);
    let pago: any = null;
    if (ses.estado === 'complete' && ses.paymentId) {
      const pr = await prov.consultarPago(ses.paymentId);
      crudo.pago = pr.body ?? pr.raw;
      if (pr.status >= 200 && pr.status < 300) pago = pr.body;
    }
    res = interpretarPago(s.body, pago, { monto: Number(p.total), referencia: referencia(p) });
  } catch (e: any) {
    // Sin respuesta de uPay no se decide nada: sigue pendiente.
    await registrar(ds, p, 'ERROR', e instanceof UpayError ? e.codigo : 'error', crudo ?? (e?.message || String(e)));
    return { ...actual, error: e instanceof UpayError ? e.codigo : 'upay_error' };
  }
  await registrar(ds, p, 'CONSULTA', res.tipo, { ...crudo, resultado: res });
  return aplicarResultado(ds, p, res, ahora);
}

async function aplicarResultado(ds: DataSource, p: PedidoOnline, res: ResultadoPago, ahora: Date): Promise<VerificacionResultado> {
  const repo = ds.getRepository(PedidoOnline);
  const cfg = await getCfg(ds);
  const base = { success: true, estado: p.estado, estadoPago: p.estadoPago ?? null } as VerificacionResultado;
  const desde = [EstadoPagoOnline.PENDIENTE, EstadoPagoOnline.FALLIDO];

  if (res.tipo === 'PAGADO') {
    const sigueVivo = p.estado === EstadoPedidoOnline.PENDIENTE_PAGO;
    if (sigueVivo) {
      const auto = !!cfg?.aceptacionAutomatica;
      const r = await repo.createQueryBuilder().update(PedidoOnline)
        .set({
          estadoPago: EstadoPagoOnline.PAGADO, pagoId: res.paymentId, pagoMonto: res.monto, pagadoEn: ahora,
          pagoDetalle: res.detalle.slice(0, 255),
          estado: auto ? EstadoPedidoOnline.ACEPTADO : EstadoPedidoOnline.RECIBIDO,
          ...(auto ? { fechaAceptado: ahora } : {}),
        } as any)
        .where('id = :id AND estado = :est AND (estado_pago IS NULL OR estado_pago IN (:...desde))', {
          id: p.id, est: EstadoPedidoOnline.PENDIENTE_PAGO, desde,
        })
        .execute();
      if (!r.affected) return { ...(await estadoGuardado(ds, p.id)) };
      await registrar(ds, p, 'PAGADO', res.detalle, null);
      return {
        success: true, estado: auto ? EstadoPedidoOnline.ACEPTADO : EstadoPedidoOnline.RECIBIDO,
        estadoPago: EstadoPagoOnline.PAGADO, recienPagado: true, aceptadoAutomatico: auto,
      };
    }
    // Pago tardío: el pedido ya se canceló o rechazó. Se cobró: hay que devolverlo.
    const r = await repo.createQueryBuilder().update(PedidoOnline)
      .set({
        estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE, pagoId: res.paymentId, pagoMonto: res.monto, pagadoEn: ahora,
        pagoDetalle: 'pago tardío: ' + res.detalle,
      } as any)
      .where('id = :id AND (estado_pago IS NULL OR estado_pago IN (:...desde, :exp))', { id: p.id, desde, exp: EstadoPagoOnline.EXPIRADO })
      .execute();
    if (r.affected) {
      await registrar(ds, p, 'REEMBOLSO', 'pago tardío', null);
      await avisarPersonal(
        `Pedido ${p.numero}: llegó un pago con tarjeta de ${gs(res.monto)} pero el pedido ya estaba ${p.estado.toLowerCase()}. Hay que devolverlo en uPay.`,
        `tarde-${p.id}`,
      );
    }
    return estadoGuardado(ds, p.id);
  }

  if (res.tipo === 'INCONSISTENTE') {
    await avisarPersonal(
      `Pedido ${p.numero}: uPay informa un cobro que no coincide con el pedido (${res.detalle}). No se dio por pagado; revisalo en uPay.`,
      `inconsistente-${p.id}-${res.paymentId ?? ''}`,
    );
    await repo.update({ id: p.id }, { pagoDetalle: ('no coincide: ' + res.detalle).slice(0, 255) } as any);
    return base;
  }

  if (res.tipo === 'FALLIDO') {
    await repo.createQueryBuilder().update(PedidoOnline)
      .set({ estadoPago: EstadoPagoOnline.FALLIDO, pagoDetalle: res.detalle.slice(0, 255) } as any)
      .where('id = :id AND estado_pago = :pend', { id: p.id, pend: EstadoPagoOnline.PENDIENTE })
      .execute();
    return estadoGuardado(ds, p.id);
  }

  if (res.tipo === 'EXPIRADO') {
    const r = await repo.createQueryBuilder().update(PedidoOnline)
      .set({
        estadoPago: EstadoPagoOnline.EXPIRADO, estado: EstadoPedidoOnline.CANCELADO,
        motivoRechazo: 'No se completó el pago con tarjeta a tiempo.', pagoDetalle: res.detalle,
      } as any)
      .where('id = :id AND estado = :est AND estado_pago IN (:...desde)', { id: p.id, est: EstadoPedidoOnline.PENDIENTE_PAGO, desde })
      .execute();
    if (r.affected) await registrar(ds, p, 'EXPIRADO', null, null);
    return estadoGuardado(ds, p.id);
  }

  // PENDIENTE: sesión abierta o algo que no entendemos. Si ya pasó el vencimiento propio y
  // uPay sigue sin decir nada, se espera: nunca se cancela un pedido sin la palabra de uPay.
  if (p.pagoExpiraEn && ahora.getTime() > new Date(p.pagoExpiraEn).getTime() + 15 * 60_000) {
    await avisarPersonal(
      `Pedido ${p.numero}: la sesión de pago venció hace más de 15 min y uPay sigue sin confirmar (${res.detalle}). Revisalo en uPay.`,
      `sin-confirmar-${p.id}`,
    );
  }
  return base;
}

async function estadoGuardado(ds: DataSource, id: number): Promise<VerificacionResultado> {
  const q = await ds.getRepository(PedidoOnline).findOne({ where: { id } });
  return { success: true, estado: q?.estado, estadoPago: q?.estadoPago ?? null };
}

/**
 * Un pedido pagado que el local rechaza (o cancela) queda para devolver. Lo llama el handler
 * de rechazo; devuelve el monto a devolver para mostrarlo.
 */
export async function marcarReembolsoSiPagado(ds: DataSource, pedidoId: number): Promise<number | null> {
  const repo = ds.getRepository(PedidoOnline);
  const p = await repo.findOne({ where: { id: pedidoId } });
  if (!p || p.estadoPago !== EstadoPagoOnline.PAGADO) return null;
  const r = await repo.createQueryBuilder().update(PedidoOnline)
    .set({ estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } as any)
    .where('id = :id AND estado_pago = :pag', { id: p.id, pag: EstadoPagoOnline.PAGADO })
    .execute();
  if (r.affected) {
    await registrar(ds, p, 'REEMBOLSO', 'rechazado por el local', null);
    await avisarPersonal(`Pedido ${p.numero} rechazado con pago con tarjeta: hay que devolver ${gs(Number(p.pagoMonto ?? p.total))} en uPay.`, `rechazo-${p.id}`);
  }
  return Number(p.pagoMonto ?? p.total);
}

/**
 * F5 (M-pay4): el rechazo ya dejó el pago en REEMBOLSO_PENDIENTE dentro de su transacción; acá
 * solo se registra el evento y se avisa al personal. Devuelve el monto a devolver.
 */
export async function avisarReembolso(ds: DataSource, p: PedidoOnline): Promise<number> {
  const monto = Number(p.pagoMonto ?? p.total);
  await registrar(ds, p, 'REEMBOLSO', 'rechazado por el local', null);
  await avisarPersonal(`Pedido ${p.numero} rechazado con pago con tarjeta: hay que devolver ${gs(monto)} en uPay.`, `rechazo-${p.id}`);
  return monto;
}

/** Marca como devuelto (el personal ya lo hizo en el portal de uPay). */
export async function marcarDevuelto(ds: DataSource, pedidoId: number): Promise<boolean> {
  const r = await ds.getRepository(PedidoOnline).createQueryBuilder().update(PedidoOnline)
    .set({ estadoPago: EstadoPagoOnline.DEVUELTO } as any)
    .where('id = :id AND estado_pago = :r', { id: pedidoId, r: EstadoPagoOnline.REEMBOLSO_PENDIENTE })
    .execute();
  if (r.affected) await registrar(ds, { id: pedidoId }, 'DEVUELTO', null, null);
  return !!r.affected;
}

/** Cada cuánto consultar un pedido en espera: 1 min los primeros 30, después 5 min. */
export function cadenciaMs(creado: Date, ahora: Date): number {
  return ahora.getTime() - new Date(creado).getTime() < 30 * 60_000 ? 60_000 : 5 * 60_000;
}

/**
 * Un ciclo del job. `alPagar` recibe los pedidos recién pagados con aceptación automática
 * (el job los materializa con la misma función que el resto de la tienda).
 */
export async function tickPagosOnline(
  ds: DataSource,
  opts: { ahora?: Date; alPagar?: (pedidoId: number) => Promise<void> } = {},
): Promise<{ consultados: number; pagados: number }> {
  const ahora = opts.ahora ?? new Date();
  const repo = ds.getRepository(PedidoOnline);
  let consultados = 0, pagados = 0;
  // F5 (auditoría A-pay1/A-pay2): el filtro va en SQL y se ordena por la consulta más vieja,
  // así 50 pedidos trabados no tapan a los nuevos. EXPIRADO se mira 24 h desde el vencimiento
  // de la sesión (no desde updatedAt, que se renueva con cada consulta).
  const hace24h = new Date(ahora.getTime() - 24 * 3600_000);
  const enEspera = await repo.createQueryBuilder('p')
    .where('p.pago_sesion_id IS NOT NULL')
    .andWhere(new Brackets((w) => {
      w.where('p.estado_pago IN (:...vivos)', { vivos: [EstadoPagoOnline.PENDIENTE, EstadoPagoOnline.FALLIDO] })
        .orWhere('(p.estado_pago = :exp AND p.pago_expira_en > :hace24h)', { exp: EstadoPagoOnline.EXPIRADO, hace24h });
    }))
    .orderBy('p.pago_ultima_consulta', 'ASC', 'NULLS FIRST')
    .addOrderBy('p.id', 'ASC')
    .take(50)
    .getMany();
  for (const p of enEspera) {
    try {
      const ultima = p.pagoUltimaConsulta ? new Date(p.pagoUltimaConsulta).getTime() : 0;
      const vence = p.pagoExpiraEn ? new Date(p.pagoExpiraEn).getTime() : Infinity;
      // Vencida la sesión: una última consulta enseguida (sin esperar la cadencia).
      const debida = ahora.getTime() - ultima >= cadenciaMs(p.createdAt, ahora) || (ahora.getTime() > vence && ultima <= vence);
      if (!debida) continue;
      consultados++;
      const r = await verificarPagoPedido(ds, p.id, { ahora });
      if (r.recienPagado) {
        pagados++;
        if (r.aceptadoAutomatico && opts.alPagar) {
          try {
            await opts.alPagar(p.id);
          } catch (e: any) {
            console.warn('[pagos-online] materializar tras pago falló:', e?.message || e);
          }
        }
        continue;
      }
      // F5 (M-pay1): un pago rechazado que nadie reintenta no queda vivo para siempre. Pasadas
      // 2 h de la creación y con la sesión vencida, se cancela (la consulta de recién fue la última).
      if (r.estadoPago === EstadoPagoOnline.FALLIDO && r.estado === EstadoPedidoOnline.PENDIENTE_PAGO
          && ahora.getTime() - new Date(p.createdAt).getTime() > 2 * 3600_000 && ahora.getTime() > vence) {
        const c = await repo.createQueryBuilder().update(PedidoOnline)
          .set({
            estadoPago: EstadoPagoOnline.EXPIRADO, estado: EstadoPedidoOnline.CANCELADO,
            motivoRechazo: 'El pago con tarjeta fue rechazado y no se reintentó a tiempo.',
          } as any)
          .where('id = :id AND estado = :est AND estado_pago = :fal', {
            id: p.id, est: EstadoPedidoOnline.PENDIENTE_PAGO, fal: EstadoPagoOnline.FALLIDO,
          })
          .execute();
        if (c.affected) await registrar(ds, p, 'EXPIRADO', 'fallido sin reintento', null);
      }
    } catch (e: any) {
      // Un pedido con un problema (p. ej. pagoId duplicado, M-pay5) no corta el ciclo de los demás.
      console.warn(`[pagos-online] pedido ${p.id}:`, e?.message || e);
    }
  }

  // F5 (auditoría C2): pagado y aceptado (aceptación automática) pero sin venta, p. ej. porque
  // no había caja abierta: se reintenta en cada ciclo; el aviso al personal se deduplica.
  if (opts.alPagar) {
    const sinVenta = await repo.find({
      where: { estadoPago: EstadoPagoOnline.PAGADO, estado: EstadoPedidoOnline.ACEPTADO, ventaId: IsNull() },
      take: 20, order: { id: 'ASC' },
    });
    for (const p of sinVenta) {
      try { await opts.alPagar(p.id); } catch (e: any) { console.warn('[pagos-online] reintento sin venta:', e?.message || e); }
    }
  }

  // Pagado y sin aceptar: aviso una sola vez.
  const cfg = await getCfg(ds);
  const min = Math.max(1, Number(cfg?.minutosAvisoPagadoSinAceptar ?? 20));
  const sinAceptar = await repo.find({
    where: { estadoPago: EstadoPagoOnline.PAGADO, estado: EstadoPedidoOnline.RECIBIDO, pagoAvisoSinAceptar: false },
    take: 50,
  });
  for (const p of sinAceptar) {
    if (!p.pagadoEn || ahora.getTime() - new Date(p.pagadoEn).getTime() < min * 60_000) continue;
    const r = await repo.update({ id: p.id, pagoAvisoSinAceptar: false }, { pagoAvisoSinAceptar: true } as any);
    if (r.affected) {
      await avisarPersonal(`Pedido ${p.numero} pagado con tarjeta (${gs(Number(p.pagoMonto ?? p.total))}) hace más de ${min} min y todavía sin aceptar.`, `sin-aceptar-${p.id}`);
    }
  }
  return { consultados, pagados };
}

let timer: NodeJS.Timeout | null = null;
/** Arranca el job (proceso principal del servidor). Revisa primero los atrasados. */
export function iniciarJobPagosOnline(ds: DataSource, alPagar: (pedidoId: number) => Promise<void>): void {
  if (timer) return;
  let corriendo = false;
  const correr = async () => {
    if (corriendo || !ds.isInitialized) return;
    corriendo = true;
    try {
      await tickPagosOnline(ds, { alPagar });
    } catch (e: any) {
      console.warn('[pagos-online] job:', e?.message || e);
    } finally {
      corriendo = false;
    }
  };
  setTimeout(correr, 5_000);
  timer = setInterval(correr, 60_000);
}
export function detenerJobPagosOnline(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

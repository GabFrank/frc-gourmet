/**
 * Pago online de pedidos de la tienda (PLAN-tienda-online F4; proveedores intercambiables en
 * PLAN-tienda-pagos-proveedores). Este archivo es el NÚCLEO común: el cobro concreto lo hace el
 * proveedor (`proveedores/`), y acá viven los estados, el pago tardío, las devoluciones, los avisos
 * y el registro de eventos, iguales para todos.
 *
 * - `iniciarPagoPedido`: crea (o reusa) el cobro del intento actual con el proveedor activo.
 * - `verificarPagoPedido`: consulta al proveedor DEL PEDIDO y aplica el resultado. ÚNICA puerta
 *   para dar un pedido por pagado (nunca el retorno del navegador). Idempotente: el cambio se
 *   hace con un UPDATE condicionado al estado anterior, así dos verificaciones a la vez no duplican.
 * - `tickPagosOnline`: lo llama el job del proceso principal (cada 60 s) para los pedidos
 *   en espera, los pagos tardíos y el aviso de pagado-sin-aceptar. Corre aunque
 *   `pagoOnlineActivo` esté apagado: apagarlo solo deja de ofrecer el pago a pedidos nuevos.
 */
import { randomUUID } from 'crypto';
import { Brackets, DataSource, IsNull } from 'typeorm';
import { PedidoOnline } from '../../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { PagoOnlineEvento } from '../../../src/app/database/entities/pedidos-online/pago-online-evento.entity';
import { TiendaOnlineConfig } from '../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import {
  DecisionPagoOnline,
  EstadoPagoOnline,
  EstadoPedidoOnline,
  esMetodoPagoOnline,
} from '../../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { DecisionPago, estadoPagoPorDecision, PagoDecidido } from '../../utils/decision-pago-online.utils';
import { UpayConfig } from './upay-checkout.provider';
import { ResultadoPago } from './interpretar-pago';
import { deps, fetchActual } from './proveedores/deps';
import { ContextoProveedor, FetchLike, ProveedorError, ProveedorPagoOnline } from './proveedores/tipos';
import { nombreProveedor, proveedorDelPedido, proveedorPorId, PROVEEDOR_UPAY } from './proveedores';
import { upayApiKey, upayConfigDeCfg, upayProveedor } from './proveedores/upay.proveedor';

export { PROVEEDOR_UPAY };
/** Mínimo entre consultas al proveedor por pedido desde el endpoint público. */
export const VERIFICAR_MIN_MS = 10_000;
const URL_PUBLICA_DEF = 'https://app.frc-gourmet.com';

// ── Dependencias inyectables (tests) ──
type Avisar = (texto: string, dedupe: string) => Promise<void>;
type ApiKeyFn = () => Promise<string>;
export function setPagosOnlineDeps(d: {
  fetch?: FetchLike | null; apiKey?: ApiKeyFn | null; avisar?: Avisar | null; secretos?: Record<string, ApiKeyFn>;
}): void {
  if (d.fetch !== undefined) deps.fetch = d.fetch;
  if (d.apiKey !== undefined) deps.apiKey = d.apiKey;
  if (d.avisar !== undefined) deps.avisar = d.avisar;
  if (d.secretos !== undefined) deps.secretos = d.secretos;
}

/** API Key de uPay vigente (almacén seguro, o la de prueba inyectada). */
export const apiKey = upayApiKey;

const ctx = (): ContextoProveedor => ({ fetch: fetchActual() });

async function avisarPersonal(texto: string, dedupe: string): Promise<void> {
  try {
    if (deps.avisar) return await deps.avisar(texto, dedupe);
    const { dispatchEvento } = await import('../notificacion.service');
    await dispatchEvento('TIENDA_PAGO_ONLINE', { asunto: 'Tienda online: pago con tarjeta', texto, dedupeKey: dedupe });
  } catch (e: any) {
    console.warn('[pagos-online] aviso al personal falló:', e?.message || e);
  }
}

async function getCfg(ds: DataSource): Promise<TiendaOnlineConfig | null> {
  return ds.getRepository(TiendaOnlineConfig).findOne({ where: {}, order: { id: 'ASC' } });
}

/** Config completa para hablar con uPay, o null si falta algo (pantalla de config). */
export async function upayConfigDe(ds: DataSource, cfg?: TiendaOnlineConfig | null): Promise<UpayConfig | null> {
  return upayConfigDeCfg(cfg === undefined ? await getCfg(ds) : cfg);
}

/** El proveedor con el que se cobran los pedidos NUEVOS. */
export function proveedorActivo(cfg: TiendaOnlineConfig | null): ProveedorPagoOnline {
  // Vacío o desconocido = uPay (instalaciones de antes de que se pudiera elegir).
  return proveedorPorId(cfg?.pagoProveedor) || upayProveedor;
}

/** Proveedor activo con sus credenciales, o null si el pago online no se puede ofrecer. */
async function proveedorActivoListo(ds: DataSource, cfg: TiendaOnlineConfig | null): Promise<{ prov: ProveedorPagoOnline; creds: any } | null> {
  const prov = proveedorActivo(cfg);
  const creds = await prov.credenciales(ds, cfg);
  return creds ? { prov, creds } : null;
}

/** ¿Se ofrece «Pagar con tarjeta» a pedidos nuevos? */
export async function pagoOnlineDisponible(ds: DataSource, cfg?: TiendaOnlineConfig | null): Promise<boolean> {
  const c = cfg === undefined ? await getCfg(ds) : cfg;
  return !!c?.pagoOnlineActivo && !!(await proveedorActivoListo(ds, c));
}

/** Código de error de una excepción del proveedor (`upay_error` si no es un `ProveedorError`). */
function codigoError(prov: ProveedorPagoOnline, e: any): string {
  return e instanceof ProveedorError ? e.codigo : `${prov.id.toLowerCase()}_error`;
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

  if (!esMetodoPagoOnline(p.metodoPago) || p.estado !== EstadoPedidoOnline.PENDIENTE_PAGO) {
    return { success: false, error: 'pedido_no_espera_pago' };
  }
  if (p.estadoPago === EstadoPagoOnline.PAGADO) return { success: false, error: 'pedido_ya_pagado' };
  // Se cobra con el proveedor con que se creó el pedido (`metodoPago`), aunque el activo haya
  // cambiado en el medio: así lo que vio el cliente y lo que se cobra coinciden.
  const prov = proveedorPorId(p.metodoPago);
  const creds = prov ? await prov.credenciales(ds, await getCfg(ds)) : null;
  if (!prov || !creds) return { success: false, error: 'pago_online_no_disponible' };

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
        pagoIntento: intento, pagoIdemKey: idem, pagoProveedor: prov.id,
        estadoPago: EstadoPagoOnline.PENDIENTE, pagoSesionId: null, pagoCheckoutUrl: null,
      } as any)
      .where('id = :id AND estado_pago = :fal AND pago_sesion_id = :ses AND COALESCE(pago_intento, 1) = :prev', {
        id: p.id, fal: EstadoPagoOnline.FALLIDO, ses: p.pagoSesionId, prev: p.pagoIntento ?? 1,
      })
      .execute();
    if (!claim.affected) return { success: false, error: 'pago_en_curso' };
  } else {
    await repo.update({ id: p.id }, { pagoIntento: intento, pagoIdemKey: idem, pagoProveedor: prov.id } as any);
  }
  p.pagoIntento = intento;

  // F5 (M-pay3): la URL pública de vuelta se puede cambiar por entorno (otro dominio o una
  // instalación de prueba); solo https.
  const delEntorno = String(process.env['FRC_TIENDA_URL_PUBLICA'] || '').trim();
  const base = (opts.urlPublica || (/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(delEntorno) ? delEntorno : URL_PUBLICA_DEF)).replace(/\/+$/, '');
  const vuelta = `${base}/tienda/pago/${encodeURIComponent(p.numero)}`;
  try {
    const r = await prov.iniciar(creds, {
      referencia: referencia(p),
      idempotencyKey: idem,
      monto: Number(p.total),
      urlVuelta: vuelta,
      descripcion: `Pedido ${p.numero}`,
      items: [
        ...(p.items || []).map((it) => ({
          name: [it.nombreProducto, it.nombrePresentacion].filter(Boolean).join(' '),
          quantity: Number(it.cantidad),
          unitPrice: Number(it.subtotal) / Math.max(1, Number(it.cantidad)),
        })),
        ...(Number(p.costoEnvio) > 0 ? [{ name: 'Envío', quantity: 1, unitPrice: Number(p.costoEnvio) }] : []),
      ],
    }, ctx());
    // Con formulario (Bancard) no hay URL a la que redirigir: se guarda el `process_id`.
    const urlGuardada = r.tipo === 'REDIRECCION' ? r.url : r.procesoId;
    await repo.update({ id: p.id }, {
      pagoSesionId: r.sesionId,
      pagoCheckoutUrl: urlGuardada,
      pagoExpiraEn: r.expiraEn ?? new Date(Date.now() + 2 * 3600_000),
      estadoPago: EstadoPagoOnline.PENDIENTE,
      pagoDetalle: null,
    } as any);
    await registrar(ds, p, 'SESION_CREADA', null, r.crudo);
    return { success: true, checkoutUrl: urlGuardada };
  } catch (e: any) {
    await registrar(ds, p, 'ERROR', e instanceof ProveedorError ? e.codigo : 'error', e?.message || String(e));
    return { success: false, error: codigoError(prov, e) };
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
 * Consulta al proveedor y aplica. `minIntervaloMs` evita martillar la API desde el endpoint público:
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
  // Lo que el local ya decidió a mano (devuelto, no acreditado, retenido) no se vuelve a consultar.
  if (!p.pagoSesionId || p.estadoPago === EstadoPagoOnline.PAGADO || p.estadoPago === EstadoPagoOnline.DEVUELTO
    || p.estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE || p.estadoPago === EstadoPagoOnline.NO_ACREDITADO
    || p.estadoPago === EstadoPagoOnline.RETENIDO) return actual;
  if (opts.minIntervaloMs && p.pagoUltimaConsulta
    && ahora.getTime() - new Date(p.pagoUltimaConsulta).getTime() < opts.minIntervaloMs) return actual;

  // El pedido se consulta con SU proveedor, aunque el local haya cambiado el activo.
  const prov = proveedorDelPedido(p);
  const creds = prov ? await prov.credenciales(ds, await getCfg(ds)) : null;
  if (!prov || !creds) return { ...actual, error: 'pago_online_no_configurado' };
  await repo.update({ id: p.id }, { pagoUltimaConsulta: ahora } as any);

  let res: ResultadoPago;
  let crudo: any = null;
  try {
    const c = await prov.consultar(creds, {
      sesionId: p.pagoSesionId, referencia: referencia(p), monto: Number(p.total), pagoId: p.pagoId ?? null,
    }, ctx());
    res = c.resultado;
    crudo = c.crudo;
  } catch (e: any) {
    // Sin respuesta del proveedor no se decide nada: sigue pendiente.
    await registrar(ds, p, 'ERROR', e instanceof ProveedorError ? e.codigo : 'error', e?.crudo ?? (e?.message || String(e)));
    return { ...actual, error: codigoError(prov, e) };
  }
  await registrar(ds, p, 'CONSULTA', res.tipo, { ...crudo, resultado: res });
  return aplicarResultado(ds, p, res, ahora);
}

/** Violación del índice único (pago_proveedor, pago_id): SQLite y Postgres. */
function esPagoIdDuplicado(e: any): boolean {
  const msg = String(e?.message || e || '');
  return e?.code === '23505' || /UNIQUE constraint failed: pedidos_online\.pago/i.test(msg) || msg.includes('UQ_pedidos_online_pago_id');
}

async function aplicarResultado(ds: DataSource, p: PedidoOnline, res: ResultadoPago, ahora: Date): Promise<VerificacionResultado> {
  try {
    return await aplicarResultadoSinCaptura(ds, p, res, ahora);
  } catch (e: any) {
    // F5 (plan §14): el mismo pago del proveedor ya está asignado a otro pedido. No se da por pagado
    // este, se registra y se avisa; el ciclo del job sigue con los demás.
    if (!(res.tipo === 'PAGADO' && esPagoIdDuplicado(e))) throw e;
    await registrar(ds, p, 'ERROR', 'pago_id_duplicado', { paymentId: res.paymentId });
    await avisarPersonal(
      `Pedido ${p.numero}: ${nombreProveedor(p.pagoProveedor)} informa el pago ${res.paymentId}, que ya figura en otro pedido. No se dio por pagado; revisalo en ${nombreProveedor(p.pagoProveedor)}.`,
      `pago-duplicado-${p.id}-${res.paymentId}`,
    );
    return { ...(await estadoGuardado(ds, p.id)), error: 'pago_id_duplicado' };
  }
}

async function aplicarResultadoSinCaptura(ds: DataSource, p: PedidoOnline, res: ResultadoPago, ahora: Date): Promise<VerificacionResultado> {
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
        `Pedido ${p.numero}: llegó un pago con tarjeta de ${gs(res.monto)} pero el pedido ya estaba ${p.estado.toLowerCase()}. Hay que devolverlo en ${nombreProveedor(p.pagoProveedor)}.`,
        `tarde-${p.id}`,
      );
    }
    return estadoGuardado(ds, p.id);
  }

  if (res.tipo === 'INCONSISTENTE') {
    await avisarPersonal(
      `Pedido ${p.numero}: ${nombreProveedor(p.pagoProveedor)} informa un cobro que no coincide con el pedido (${res.detalle}). No se dio por pagado; revisalo en ${nombreProveedor(p.pagoProveedor)}.`,
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
  // el proveedor sigue sin decir nada, se espera: nunca se cancela un pedido sin su palabra.
  if (p.pagoExpiraEn && ahora.getTime() > new Date(p.pagoExpiraEn).getTime() + 15 * 60_000) {
    await avisarPersonal(
      `Pedido ${p.numero}: la sesión de pago venció hace más de 15 min y ${nombreProveedor(p.pagoProveedor)} sigue sin confirmar (${res.detalle}). Revisalo en ${nombreProveedor(p.pagoProveedor)}.`,
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
    await avisarPersonal(`Pedido ${p.numero} rechazado con pago con tarjeta: hay que devolver ${gs(Number(p.pagoMonto ?? p.total))} en ${nombreProveedor(p.pagoProveedor)}.`, `rechazo-${p.id}`);
  }
  return Number(p.pagoMonto ?? p.total);
}

/**
 * F5 (M-pay4): el rechazo ya dejó el pago en REEMBOLSO_PENDIENTE dentro de su transacción; acá
 * solo se registra el evento y se avisa al personal. Devuelve el monto a devolver.
 */
export type ContextoCancelacionPago = 'RECHAZADO' | 'CANCELADO' | 'CANCELADO_PDV';
/** Además de las cancelaciones, una devolución pendiente que se resuelve sin devolver. */
type ContextoDecision = ContextoCancelacionPago | 'RESUELTO';

const QUE_PASO: Record<ContextoCancelacionPago, string> = {
  RECHAZADO: 'rechazado por el local',
  // F9: aprobar la cancelación que pidió el cliente también devuelve; el texto lo dice.
  CANCELADO: 'cancelado a pedido del cliente',
  // Auditoría post-F10: cancelado desde el diálogo de delivery, el PdV o el historial de ventas.
  CANCELADO_PDV: 'cancelado en el PdV',
};

export async function avisarReembolso(ds: DataSource, p: PedidoOnline, motivo: ContextoCancelacionPago = 'RECHAZADO'): Promise<number> {
  const monto = Number(p.pagoMonto ?? p.total);
  const que = QUE_PASO[motivo];
  await registrar(ds, p, 'REEMBOLSO', que, null);
  await avisarPersonal(`Pedido ${p.numero} ${que} con pago con tarjeta: hay que devolver ${gs(monto)} en ${nombreProveedor(p.pagoProveedor)}.`, `rechazo-${p.id}`);
  return monto;
}

const TEXTO_DECISION: Record<DecisionPagoOnline, string> = {
  [DecisionPagoOnline.DEVOLVER]: 'hay que devolverlo',
  [DecisionPagoOnline.YA_DEVUELTO]: 'ya se devolvió en el portal del proveedor',
  [DecisionPagoOnline.NO_ENTRO]: 'el pago no entró',
  [DecisionPagoOnline.NO_SE_DEVUELVE]: 'no se devuelve',
};

/**
 * Auditoría post-F10: después del commit de una cancelación, deja en el historial del pago qué
 * se decidió con lo cobrado, quién y por qué, y avisa al personal. «Devolver» es el aviso de
 * siempre (`avisarReembolso`); «no entró» y «no se devuelve» también avisan, porque dejan plata
 * del cliente sin devolver. Nunca lanza: el cambio ya quedó hecho.
 */
export async function registrarDecisionPago(
  ds: DataSource,
  pedidoId: number,
  decision: DecisionPago,
  contexto: ContextoDecision,
  usuarioId?: number | null,
): Promise<number | null> {
  try {
    const p = await ds.getRepository(PedidoOnline).findOne({ where: { id: pedidoId } });
    if (!p) return null;
    const monto = Number(p.pagoMonto ?? p.total);
    if (decision.decision === DecisionPagoOnline.DEVOLVER) {
      return contexto === 'RESUELTO' ? null : await avisarReembolso(ds, p, contexto);
    }
    await registrar(ds, p, 'DECISION_PAGO', decision.decision, {
      contexto, motivo: decision.motivo, usuarioId: usuarioId ?? null, monto,
    });
    if (decision.decision !== DecisionPagoOnline.YA_DEVUELTO) {
      const que = contexto === 'RESUELTO'
        ? `: la devolución pendiente de ${gs(monto)} se cerró`
        : ` ${QUE_PASO[contexto]} con pago con tarjeta de ${gs(monto)}`;
      await avisarPersonal(
        `Pedido ${p.numero}${que}: ${TEXTO_DECISION[decision.decision]}` + (decision.motivo ? ` (${decision.motivo}).` : '.'),
        `decision-${p.id}`,
      );
    }
    return null;
  } catch (e: any) {
    console.warn('[pagos-online] registrar la decisión del pago falló:', e?.message || e);
    return null;
  }
}

/** Avisa cada pago decidido dentro de una transacción ya confirmada. */
export async function registrarDecisionesPago(
  ds: DataSource, pagos: PagoDecidido[], contexto: ContextoCancelacionPago, usuarioId?: number | null,
): Promise<void> {
  for (const x of pagos) await registrarDecisionPago(ds, x.pedidoId, x.decision, contexto, usuarioId);
}

/**
 * Resuelve una devolución pendiente: ya se devolvió, el pago no entró, o no se devuelve.
 * Condicionado a REEMBOLSO_PENDIENTE: dos personas resolviendo a la vez no se pisan.
 */
export async function resolverDevolucionPendiente(
  ds: DataSource, pedidoId: number, decision: DecisionPago, usuarioId?: number | null,
): Promise<boolean> {
  if (decision.decision === DecisionPagoOnline.DEVOLVER) return false;
  const r = await ds.getRepository(PedidoOnline).createQueryBuilder().update(PedidoOnline)
    .set({ estadoPago: estadoPagoPorDecision(decision) } as any)
    .where('id = :id AND estado_pago = :r', { id: pedidoId, r: EstadoPagoOnline.REEMBOLSO_PENDIENTE })
    .execute();
  if (!r.affected) return false;
  if (decision.decision === DecisionPagoOnline.YA_DEVUELTO) {
    await registrar(ds, { id: pedidoId }, 'DEVUELTO', null, usuarioId ? { usuarioId } : null);
  } else {
    await registrarDecisionPago(ds, pedidoId, decision, 'RESUELTO', usuarioId);
  }
  return true;
}

/** Marca como devuelto (el personal ya lo hizo en el portal del proveedor). */
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

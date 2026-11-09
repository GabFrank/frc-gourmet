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
import { ContextoProveedor, DatosQr, FetchLike, ProveedorError, ProveedorPagoOnline } from './proveedores/tipos';
import { nombreProveedor, proveedorDelPedido, proveedorPorId, PROVEEDOR_UPAY } from './proveedores';
import { upayApiKey, upayConfigDeCfg, upayProveedor } from './proveedores/upay.proveedor';
import { cuentaDelPedido, cuentasListas, cuentasParaAviso, CuentaResuelta } from './cuentas-pago';

export { cuentasListas } from './cuentas-pago';

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

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * El proveedor «principal» (compat: pantallas y textos que hablan de «el» proveedor): el de la
 * primera cuenta lista, o el de la config de antes (vacío = uPay).
 */
export function proveedorActivo(cfg: TiendaOnlineConfig | null): ProveedorPagoOnline {
  return proveedorPorId(cfg?.pagoProveedor) || upayProveedor;
}

/** ¿Se ofrece el pago online a pedidos nuevos? (interruptor + alguna cuenta lista) */
export async function pagoOnlineDisponible(ds: DataSource, cfg?: TiendaOnlineConfig | null): Promise<boolean> {
  const c = cfg === undefined ? await getCfg(ds) : cfg;
  return !!c?.pagoOnlineActivo && (await cuentasListas(ds, c)).length > 0;
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
 * Devuelve a dónde va el cliente: la URL del proveedor (`REDIRECCION`), o el proceso y el script
 * para armar el formulario en la página de pago de la tienda (`FORMULARIO`, Bancard). En los dos
 * casos `checkoutUrl` viene (compat F4): con formulario es el id del proceso.
 */
export type InicioPagoRespuesta =
  | { success: true; checkoutUrl: string; tipo: 'REDIRECCION'; hosts: string[] }
  | { success: true; checkoutUrl: string; tipo: 'FORMULARIO'; procesoId: string; script: string; proveedor: string; hosts: string[] }
  | { success: true; checkoutUrl: string; tipo: 'QR'; qr: DatosQr; proveedor: string; hosts: string[] }
  | { success: false; error: string };

/**
 * `hosts` son los del proveedor DEL PEDIDO: el storefront valida contra estos y no contra el
 * activo, así un pedido en curso sigue pudiéndose pagar aunque el local cambie de proveedor.
 */
function respuestaInicio(prov: ProveedorPagoOnline, creds: any, guardado: string, datos?: Record<string, any> | null): InicioPagoRespuesta {
  if (prov.modo === 'QR') {
    const qr = datos?.qr as DatosQr | undefined;
    if (!qr?.payload) return { success: false, error: 'pago_en_curso' };
    return { success: true, checkoutUrl: guardado, tipo: 'QR', qr, proveedor: prov.id, hosts: prov.hosts };
  }
  if (prov.modo === 'FORMULARIO') {
    return { success: true, checkoutUrl: guardado, tipo: 'FORMULARIO', procesoId: guardado, script: prov.scriptUrl ? prov.scriptUrl(creds) : '', proveedor: prov.id, hosts: prov.hosts };
  }
  return { success: true, checkoutUrl: guardado, tipo: 'REDIRECCION', hosts: prov.hosts };
}

/** URL pública de la tienda (vuelta del pago, URL de confirmación del proveedor). Solo https. */
export function urlPublicaTienda(override?: string): string {
  const delEntorno = String(process.env['FRC_TIENDA_URL_PUBLICA'] || '').trim();
  return (override || (/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(delEntorno) ? delEntorno : URL_PUBLICA_DEF)).replace(/\/+$/, '');
}

/** Un intento como entero único, para los proveedores que lo exigen (Bancard). */
const MAX_INTENTOS = 99;
function procesoNumerico(pedidoId: number, intento: number): number {
  return pedidoId * 100 + intento;
}
/** `pago_datos_json` parseado (o null). */
function datosDe(json: string | null | undefined): Record<string, any> | null {
  if (!json) return null;
  const v = safeParse(json);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/**
 * `formaPagoOnlineId`: con `nuevoIntento` tras un intento FALLIDO, el cliente puede pagar con OTRA
 * de las cuentas listas (p. ej. su banco no opera con Bancard): el pedido pasa a esa cuenta.
 * `proveedor` (compat): elige la primera cuenta lista de ese proveedor.
 */
export async function iniciarPagoPedido(
  ds: DataSource,
  pedidoId: number,
  opts: { nuevoIntento?: boolean; urlPublica?: string; proveedor?: string | null; formaPagoOnlineId?: number | null } = {},
): Promise<InicioPagoRespuesta> {
  const repo = ds.getRepository(PedidoOnline);
  const p = await repo.findOne({
    where: { id: pedidoId },
    relations: ['items'],
    select: undefined as any,
  });
  if (!p) return { success: false, error: 'pedido_no_encontrado' };
  const extra = await repo.createQueryBuilder('p').addSelect(['p.pagoIdemKey', 'p.pagoCheckoutUrl', 'p.pagoDatosJson']).where('p.id = :id', { id: p.id }).getOne();
  p.pagoIdemKey = extra?.pagoIdemKey ?? null;
  p.pagoCheckoutUrl = extra?.pagoCheckoutUrl ?? null;
  p.pagoDatosJson = extra?.pagoDatosJson ?? null;

  if (!esMetodoPagoOnline(p.metodoPago) || p.estado !== EstadoPedidoOnline.PENDIENTE_PAGO) {
    return { success: false, error: 'pedido_no_espera_pago' };
  }
  if (p.estadoPago === EstadoPagoOnline.PAGADO) return { success: false, error: 'pedido_ya_pagado' };
  // Se cobra con la cuenta con que se creó el pedido, aunque después cambien las cuentas
  // prendidas: así lo que vio el cliente y lo que se cobra coinciden.
  const cfg = await getCfg(ds);
  let destino: CuentaResuelta | null = null;
  const pideOtra = opts.formaPagoOnlineId || opts.proveedor;
  if (pideOtra) {
    const listas = await cuentasListas(ds, cfg, p.tipoPedido);
    const elegida = opts.formaPagoOnlineId
      ? listas.find((c) => c.forma?.id === Number(opts.formaPagoOnlineId))
      : listas.find((c) => c.prov.id === String(opts.proveedor).toUpperCase());
    const esLaMisma = elegida && (elegida.forma?.id ?? null) === (p.formaPagoOnlineId ?? null) && elegida.prov.id === String(p.metodoPago).toUpperCase();
    if (!esLaMisma) {
      // Cambio de medio: solo tras un intento fallido y a una cuenta lista.
      if (!opts.nuevoIntento || p.estadoPago !== EstadoPagoOnline.FALLIDO) return { success: false, error: 'pago_en_curso' };
      if (!elegida) return { success: false, error: 'pago_online_no_disponible' };
      destino = elegida;
    }
  }
  const cambia = !!destino;
  const actualCuenta = destino || (await cuentaDelPedido(ds, cfg, { ...p, pagoProveedor: p.metodoPago }));
  if (!actualCuenta) return { success: false, error: 'pago_online_no_disponible' };
  const { prov, creds } = actualCuenta;
  const formaId = actualCuenta.forma?.id ?? null;

  // Sesión vigente del mismo intento: se reusa (doble clic, reintento de red).
  const vigente = p.pagoSesionId && p.pagoCheckoutUrl && p.estadoPago === EstadoPagoOnline.PENDIENTE
    && (!p.pagoExpiraEn || new Date(p.pagoExpiraEn).getTime() > Date.now() + 60_000);
  if (vigente && !opts.nuevoIntento) return respuestaInicio(prov, creds, p.pagoCheckoutUrl!, datosDe(p.pagoDatosJson));

  // Hay sesión: un intento nuevo solo si la anterior FALLÓ. Con una abierta (que todavía se
  // puede pagar) no se abre otra: cobraría dos veces.
  let intento = p.pagoIntento ?? 1;
  let idem = p.pagoIdemKey || randomUUID(); // sin sesión todavía: reintento de red = misma clave
  if (p.pagoSesionId) {
    if (p.estadoPago !== EstadoPagoOnline.FALLIDO) return { success: false, error: 'pago_en_curso' };
    intento += 1;
    if (intento > MAX_INTENTOS) return { success: false, error: 'demasiados_intentos' };
    idem = randomUUID();
    // F5 (auditoría A-pay3): se RECLAMA el intento con un UPDATE condicionado. Dos reintentos a
    // la vez abrían dos sesiones en uPay y la que no quedaba guardada seguía siendo pagable.
    const claim = await repo.createQueryBuilder().update(PedidoOnline)
      .set({
        pagoIntento: intento, pagoIdemKey: idem, pagoProveedor: prov.id,
        estadoPago: EstadoPagoOnline.PENDIENTE, pagoSesionId: null, pagoCheckoutUrl: null, pagoDatosJson: null,
        formaPagoOnlineId: formaId,
        ...(cambia ? { metodoPago: prov.id } : {}),
      } as any)
      .where('id = :id AND estado_pago = :fal AND pago_sesion_id = :ses AND COALESCE(pago_intento, 1) = :prev', {
        id: p.id, fal: EstadoPagoOnline.FALLIDO, ses: p.pagoSesionId, prev: p.pagoIntento ?? 1,
      })
      .execute();
    if (!claim.affected) return { success: false, error: 'pago_en_curso' };
  } else {
    await repo.update({ id: p.id }, { pagoIntento: intento, pagoIdemKey: idem, pagoProveedor: prov.id, formaPagoOnlineId: formaId } as any);
  }
  p.pagoIntento = intento;

  // F5 (M-pay3): la URL pública de vuelta se puede cambiar por entorno (otro dominio o una
  // instalación de prueba); solo https.
  const vuelta = `${urlPublicaTienda(opts.urlPublica)}/tienda/pago/${encodeURIComponent(p.numero)}`;
  try {
    const r = await prov.iniciar(creds, {
      referencia: referencia(p),
      procesoNumerico: procesoNumerico(p.id, intento),
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
    // Con formulario (Bancard) no hay URL a la que redirigir: se guarda el `process_id`. Con QR
    // (IC Pay), la marca `qr:<sesión>`; el QR mismo va en `pago_datos_json`.
    const urlGuardada = r.tipo === 'REDIRECCION' ? r.url : r.tipo === 'FORMULARIO' ? r.procesoId : `qr:${r.sesionId}`;
    const datos = r.tipo === 'QR' ? r.datos : null;
    await repo.update({ id: p.id }, {
      pagoSesionId: r.sesionId,
      pagoCheckoutUrl: urlGuardada,
      pagoDatosJson: datos ? JSON.stringify(datos) : null,
      pagoExpiraEn: r.expiraEn ?? new Date(Date.now() + 2 * 3600_000),
      estadoPago: EstadoPagoOnline.PENDIENTE,
      pagoDetalle: null,
    } as any);
    await registrar(ds, p, 'SESION_CREADA', null, r.crudo);
    return respuestaInicio(prov, creds, urlGuardada, datos);
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
    || p.estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE || p.estadoPago === EstadoPagoOnline.DEVOLVIENDO
    || p.estadoPago === EstadoPagoOnline.NO_ACREDITADO
    || p.estadoPago === EstadoPagoOnline.RETENIDO) return actual;
  if (opts.minIntervaloMs && p.pagoUltimaConsulta
    && ahora.getTime() - new Date(p.pagoUltimaConsulta).getTime() < opts.minIntervaloMs) return actual;

  // El pedido se consulta con SU cuenta, aunque el local haya cambiado las prendidas.
  const cp = await cuentaDelPedido(ds, await getCfg(ds), p);
  if (!cp) return { ...actual, error: 'pago_online_no_configurado' };
  const { prov, creds } = cp;
  await repo.update({ id: p.id }, { pagoUltimaConsulta: ahora } as any);

  let res: ResultadoPago;
  let crudo: any = null;
  try {
    const dj = await repo.createQueryBuilder('p').addSelect('p.pagoDatosJson').where('p.id = :id', { id: p.id }).getOne();
    const c = await prov.consultar(creds, {
      sesionId: p.pagoSesionId, referencia: referencia(p), monto: Number(p.total), pagoId: p.pagoId ?? null,
      expiraEn: p.pagoExpiraEn ?? null, ahora, datos: datosDe(dj?.pagoDatosJson),
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

/**
 * Aviso del proveedor (webhook: Bancard manda la confirmación a `/pub/pagos/bancard/aviso`).
 *
 * El aviso NUNCA decide solo: la firma de Bancard no cubre la respuesta (un rechazo y una
 * aprobación del mismo cobro llevan el mismo token), así que un aviso con firma válida solo dice
 * «andá a preguntar». La decisión sale de la CONSULTA directa a Bancard, igual que en el job, y
 * se aplica con `aplicarResultado` (UPDATE condicionado, idempotente).
 *
 * Respuestas: 200 con firma válida (aunque la consulta falle: el job vuelve a preguntar), 400 en
 * cualquier otro caso, sin distinguir si el proceso existe. Un aviso inválido no se guarda.
 */
export async function procesarAvisoPago(
  ds: DataSource, proveedorId: string, body: any, opts: { ahora?: Date } = {},
): Promise<{ http: number; respuesta: any; pedidoId?: number; resultado?: VerificacionResultado }> {
  const rechazo = { http: 400, respuesta: { status: 'error' } };
  // `BANCARD` o `BANCARD-7` (la cuenta 7: cada cuenta registra su propia URL en el portal).
  const m = String(proveedorId || '').toUpperCase().match(/^([A-Z]{2,20})(?:-(\d{1,9}))?$/);
  const prov = m ? proveedorPorId(m[1]) : null;
  if (!prov?.procesarAviso) return rechazo;
  const cfg = await getCfg(ds);
  const candidatas = await cuentasParaAviso(ds, cfg, prov.id, m?.[2] ? Number(m[2]) : null);
  if (!candidatas.length) return { http: 503, respuesta: { status: 'error' } };
  const repo = ds.getRepository(PedidoOnline);
  let pedido: PedidoOnline | null = null;
  let sesionAviso: string | null = null;
  try {
    // La firma dice de qué cuenta es: se prueba con cada candidata (casi siempre una).
    let a: Awaited<ReturnType<NonNullable<ProveedorPagoOnline['procesarAviso']>>> | null = null;
    let ultimoError: any = null;
    for (const cand of candidatas) {
      try {
        a = await prov.procesarAviso!(cand.creds, body, buscarPedido);
        break;
      } catch (e: any) {
        ultimoError = e;
        pedido = null;
      }
    }
    if (!a) throw ultimoError || new ProveedorError(`${prov.id.toLowerCase()}_aviso_invalido`, 'aviso sin cuenta');
    async function buscarPedido(sesionId: string) {
      sesionAviso = sesionId;
      pedido = await repo.findOne({ where: { pagoSesionId: sesionId, pagoProveedor: prov.id } as any });
      // Un intento anterior del mismo pedido (el cliente reintentó y después pagó en el viejo):
      // el proceso se arma con `pedido.id * 100 + intento`, así que se sabe de qué pedido es.
      if (!pedido && /^\d+$/.test(sesionId) && Number(sesionId) % 100 > 0) {
        const cand = await repo.findOne({ where: { id: Math.floor(Number(sesionId) / 100), pagoProveedor: prov.id } as any });
        if (cand && Number(sesionId) % 100 < Number(cand.pagoIntento ?? 1)) pedido = cand;
      }
      return pedido ? { sesionId, referencia: referencia(pedido), monto: Number(pedido.total) } : null;
    }
    const p = pedido as PedidoOnline | null;
    if (!p) return rechazo;
    const cp = await cuentaDelPedido(ds, cfg, p);
    if (!cp) return { http: 200, respuesta: a.respuesta, pedidoId: p.id };
    const creds = cp.creds;
    await registrar(ds, p, 'AVISO', a.resultado.tipo, { aviso: a.crudo });
    // La verdad la da la consulta a Bancard, no el aviso.
    let res: ResultadoPago;
    try {
      const c = await prov.consultar(creds, {
        sesionId: a.sesionId, referencia: referencia(p), monto: Number(p.total), pagoId: p.pagoId ?? null,
        expiraEn: p.pagoExpiraEn ?? null, ahora: opts.ahora,
      }, ctx());
      res = c.resultado;
      await registrar(ds, p, 'CONSULTA', res.tipo, { ...c.crudo, resultado: res, porAviso: true });
    } catch (e: any) {
      await registrar(ds, p, 'ERROR', e instanceof ProveedorError ? e.codigo : 'error', e?.crudo ?? (e?.message || String(e)));
      return { http: 200, respuesta: a.respuesta, pedidoId: p.id };
    }
    const deIntentoAnterior = sesionAviso !== p.pagoSesionId;
    if (deIntentoAnterior && res.tipo !== 'PAGADO') return { http: 200, respuesta: a.respuesta, pedidoId: p.id };
    const r = await aplicarResultado(ds, p, res, opts.ahora ?? new Date());
    return { http: 200, respuesta: a.respuesta, pedidoId: p.id, resultado: r };
  } catch (e: any) {
    // Firma inválida, proceso desconocido o aviso mal formado: no se guarda nada del cuerpo.
    console.warn(`[pagos-online] aviso de ${prov.nombre} rechazado (${e instanceof ProveedorError ? e.codigo : 'error'}):`, e?.message || e);
    return rechazo;
  }
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
      if (!r.affected) {
        // El pedido cambió entre la lectura y el UPDATE (p. ej. lo cancelaron en ese instante): si
        // el pago sigue sin registrar, es un pago tardío y tiene que quedar para devolver.
        const q = await repo.findOne({ where: { id: p.id } });
        const sinRegistrar = !q?.estadoPago || desde.includes(q.estadoPago as EstadoPagoOnline);
        if (q && q.estado !== EstadoPedidoOnline.PENDIENTE_PAGO && sinRegistrar) return aplicarResultadoSinCaptura(ds, q, res, ahora);
        return { ...(await estadoGuardado(ds, p.id)) };
      }
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
      const auto = await intentarDevolucionAutomatica(ds, p.id);
      await avisarPersonal(
        `Pedido ${p.numero}: llegó un pago con tarjeta de ${gs(res.monto)} pero el pedido ya estaba ${p.estado.toLowerCase()}. `
          + textoDevolver({ ...p, pagoMonto: res.monto } as PedidoOnline, res.monto, auto).replace(/^./, (c) => c.toUpperCase()),
        `tarde-${p.id}`,
      );
    } else if (p.pagoId && res.paymentId && String(p.pagoId) !== String(res.paymentId)) {
      // Un SEGUNDO cobro para un pedido que ya estaba pagado (p. ej. el cliente pagó en un intento
      // anterior y en el nuevo). No se pisa el primero: se registra y se avisa para devolverlo a mano.
      await registrar(ds, p, 'COBRO_DUPLICADO', res.paymentId, { monto: res.monto, detalle: res.detalle });
      await avisarPersonal(
        `Pedido ${p.numero}: ${nombreProveedor(p.pagoProveedor)} informa un segundo cobro de ${gs(res.monto)} (${res.paymentId}) y el pedido ya estaba pagado. Hay que devolverlo en ${nombreProveedor(p.pagoProveedor)}.`,
        `duplicado-${p.id}-${res.paymentId}`,
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

export interface DevolucionAutomatica {
  ok: boolean;
  detalle: string;
}

/**
 * Devolución automática (PLAN-tienda-pagos-proveedores §5): si la tienda la activó y el proveedor
 * del pedido sabe devolver por API, se intenta sobre un pedido que quedó REEMBOLSO_PENDIENTE.
 * Sale bien → DEVUELTO (condicionado: dos intentos a la vez no se pisan). Sale mal → queda en la
 * cola DEVOLVER como siempre, con el motivo en el evento. Devuelve null si no se intentó.
 */
export async function intentarDevolucionAutomatica(ds: DataSource, pedidoId: number): Promise<DevolucionAutomatica | null> {
  try {
    const cfg = await getCfg(ds);
    if (!cfg?.pagoDevolucionAutomatica) return null;
    const p = await ds.getRepository(PedidoOnline).findOne({ where: { id: pedidoId } });
    if (!p || p.estadoPago !== EstadoPagoOnline.REEMBOLSO_PENDIENTE || !p.pagoSesionId) return null;
    const provP = proveedorDelPedido(p);
    if (!provP?.devolver) return null;
    const cp = await cuentaDelPedido(ds, cfg, p);
    if (!cp) return { ok: false, detalle: `${provP.nombre} no está configurado` };
    const { prov, creds } = cp;
    const repo = ds.getRepository(PedidoOnline);
    const mover = (de: EstadoPagoOnline, a: EstadoPagoOnline) => repo.createQueryBuilder().update(PedidoOnline)
      .set({ estadoPago: a } as any).where('id = :id AND estado_pago = :de', { id: p.id, de }).execute();
    // Se RECLAMA antes de llamar al proveedor: mientras dura la llamada nadie puede resolver la
    // devolución a mano («no se devuelve») ni lanzar una segunda anulación.
    const claim = await mover(EstadoPagoOnline.REEMBOLSO_PENDIENTE, EstadoPagoOnline.DEVOLVIENDO);
    if (!claim.affected) return null;
    let r: { ok: boolean; detalle: string; crudo?: any; incierto?: boolean };
    try {
      r = await prov.devolver(creds, { sesionId: p.pagoSesionId, referencia: referencia(p), monto: Number(p.total), pagoId: p.pagoId ?? null }, ctx());
    } catch (e: any) {
      // Sin respuesta (tiempo, red): no se sabe si el proveedor lo anuló. Vuelve a la cola, pero
      // el aviso pide verificarlo en el proveedor antes de devolver a mano (no devolver dos veces).
      r = { ok: false, incierto: true, detalle: `sin respuesta de ${prov.nombre}; verificá allá si se anuló antes de devolverlo a mano (${e?.message || e})` };
    }
    await registrar(ds, p, 'DEVOLUCION_AUTO', r.ok ? 'OK' : r.incierto ? 'INCIERTO' : 'FALLO', { detalle: r.detalle, respuesta: r.crudo ?? null });
    if (!r.ok) {
      await mover(EstadoPagoOnline.DEVOLVIENDO, EstadoPagoOnline.REEMBOLSO_PENDIENTE);
      return { ok: false, detalle: r.detalle };
    }
    const u = await mover(EstadoPagoOnline.DEVOLVIENDO, EstadoPagoOnline.DEVUELTO);
    if (u.affected) await registrar(ds, p, 'DEVUELTO', 'automática', null);
    return { ok: true, detalle: r.detalle };
  } catch (e: any) {
    console.warn('[pagos-online] devolución automática falló:', e?.message || e);
    return { ok: false, detalle: e?.message || String(e) };
  }
}

/** Texto del aviso al personal para algo que quedó para devolver, según la devolución automática. */
function textoDevolver(p: PedidoOnline, monto: number, auto: DevolucionAutomatica | null): string {
  const prov = nombreProveedor(p.pagoProveedor);
  if (auto?.ok) return `se devolvió ${gs(monto)} automáticamente en ${prov}.`;
  if (auto) return `hay que devolver ${gs(monto)} en ${prov} (la devolución automática no se pudo: ${auto.detalle}).`;
  return `hay que devolver ${gs(monto)} en ${prov}.`;
}

export async function avisarReembolso(
  ds: DataSource, p: PedidoOnline, motivo: ContextoCancelacionPago = 'RECHAZADO',
): Promise<{ monto: number; devolucionAutomatica: DevolucionAutomatica | null }> {
  const monto = Number(p.pagoMonto ?? p.total);
  const que = QUE_PASO[motivo];
  await registrar(ds, p, 'REEMBOLSO', que, null);
  const auto = await intentarDevolucionAutomatica(ds, p.id);
  await avisarPersonal(`Pedido ${p.numero} ${que} con pago con tarjeta: ${textoDevolver(p, monto, auto)}`, `rechazo-${p.id}`);
  return { monto, devolucionAutomatica: auto };
}

const TEXTO_DECISION: Record<DecisionPagoOnline, string> = {
  [DecisionPagoOnline.DEVOLVER]: 'hay que devolverlo',
  [DecisionPagoOnline.YA_DEVUELTO]: 'ya se devolvió en el portal del proveedor',
  [DecisionPagoOnline.NO_ENTRO]: 'el pago no entró',
  [DecisionPagoOnline.NO_SE_DEVUELVE]: 'no se devuelve',
};

export interface ResultadoDecisionPago {
  /** Lo que queda para devolver a mano (null si no hay, o si se devolvió solo). */
  montoDevolver: number | null;
  devolucionAutomatica: DevolucionAutomatica | null;
}

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
): Promise<ResultadoDecisionPago> {
  const nada: ResultadoDecisionPago = { montoDevolver: null, devolucionAutomatica: null };
  try {
    const p = await ds.getRepository(PedidoOnline).findOne({ where: { id: pedidoId } });
    if (!p) return nada;
    const monto = Number(p.pagoMonto ?? p.total);
    if (decision.decision === DecisionPagoOnline.DEVOLVER) {
      if (contexto === 'RESUELTO') return nada;
      const r = await avisarReembolso(ds, p, contexto);
      // Devuelto solo: ya no queda nada para devolver a mano.
      return { montoDevolver: r.devolucionAutomatica?.ok ? null : r.monto, devolucionAutomatica: r.devolucionAutomatica };
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
    return nada;
  } catch (e: any) {
    console.warn('[pagos-online] registrar la decisión del pago falló:', e?.message || e);
    return nada;
  }
}

/** Avisa cada pago decidido dentro de una transacción ya confirmada. */
export async function registrarDecisionesPago(
  ds: DataSource, pagos: PagoDecidido[], contexto: ContextoCancelacionPago, usuarioId?: number | null,
): Promise<ResultadoDecisionPago[]> {
  const out: ResultadoDecisionPago[] = [];
  for (const x of pagos) out.push(await registrarDecisionPago(ds, x.pedidoId, x.decision, contexto, usuarioId));
  return out;
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

  // Devolución automática trabada (el proceso se cortó en medio de la llamada): pasados 10 min
  // vuelve a la cola, con aviso para verificarla en el proveedor antes de devolver a mano.
  const trabadas = await repo.createQueryBuilder('p')
    .where('p.estado_pago = :dv AND p.updated_at < :hace', { dv: EstadoPagoOnline.DEVOLVIENDO, hace: new Date(ahora.getTime() - 10 * 60_000) })
    .take(20).getMany();
  for (const p of trabadas) {
    const r = await repo.createQueryBuilder().update(PedidoOnline).set({ estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } as any)
      .where('id = :id AND estado_pago = :dv', { id: p.id, dv: EstadoPagoOnline.DEVOLVIENDO }).execute();
    if (r.affected) {
      await registrar(ds, p, 'DEVOLUCION_AUTO', 'TRABADA', null);
      await avisarPersonal(`Pedido ${p.numero}: la devolución automática no terminó. Verificá en ${nombreProveedor(p.pagoProveedor)} si se anuló antes de devolverlo a mano.`, `trabada-${p.id}`);
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

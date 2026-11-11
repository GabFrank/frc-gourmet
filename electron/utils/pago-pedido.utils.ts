/**
 * Tienda online F8: cómo va a pagar el cliente.
 *
 * El pedido NO se cobra acá: se registra «paga con efectivo US$ 20», «QR al recibir», etc., para
 * que el cajero (o el repartidor) lo sepa y el cobro del PdV lo traiga precargado. Por detrás todo
 * es guaraní (la moneda principal); otra moneda es sólo cómo entrega el billete el cliente. El
 * vuelto va siempre en la principal.
 *
 * Conversión: extranjera → principal = × `compraLocal` (la regla del repo: `moneda.utils.ts`,
 * `conversion-moneda.ts`, cobro del PdV). Es la tasa a la que el local RECIBE esa moneda.
 */
import { DataSource } from 'typeorm';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { MonedaBillete } from '../../src/app/database/entities/financiero/moneda-billete.entity';
import {
  METODOS_AL_RECIBIR, MetodoPagoOnline, PagoModalidad, esMetodoPagoOnline,
} from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { getCotizacionCompraLocal } from './moneda.utils';

export interface MonedaTienda {
  id: number;
  denominacion: string;
  simbolo: string;
  decimales: number;
  principal: boolean;
  /** Unidades de la principal por 1 unidad de esta (1 en la principal). */
  cotizacion: number;
  /** Billetes activos, de menor a mayor (para las sugerencias de vuelto). */
  billetes: number[];
}

/** Métodos «al recibir» que ofrece la tienda. Sin configurar (o vacío) = sólo efectivo, como antes. */
export function metodosAlRecibir(cfg: { metodosPago?: string | null } | null | undefined): MetodoPagoOnline[] {
  let lista: any = null;
  try { lista = cfg?.metodosPago ? JSON.parse(cfg.metodosPago) : null; } catch { lista = null; }
  const validos = Array.isArray(lista)
    ? METODOS_AL_RECIBIR.filter((m) => lista.includes(m))
    : [];
  return validos.length ? validos : [MetodoPagoOnline.EFECTIVO];
}

/** Monedas activas con cotización vigente a la principal (las que no tienen, no se ofrecen). */
/**
 * El total en reales como lo muestra la tienda (misma cotización y mismo redondeo hacia arriba que
 * `convertir` del storefront). null si la tienda no tiene el real activo con cotización.
 */
export async function totalEnReales(ds: DataSource, guaranies: number): Promise<number | null> {
  const real = (await ds.getRepository(Moneda).find({ where: { activo: true } as any }) as any[])
    .find((m) => !m.principal && (String(m.countryCode || '').toUpperCase() === 'BR' || String(m.simbolo || '').trim() === 'R$'));
  if (!real) return null;
  const lista = await monedasTienda(ds);
  const m = lista.find((x) => x.id === real.id);
  if (!m || !(m.cotizacion > 0) || !(guaranies > 0)) return null;
  const f = Math.pow(10, Math.max(0, m.decimales));
  return Math.ceil((guaranies / m.cotizacion) * f - 1e-9) / f;
}

export async function monedasTienda(ds: DataSource): Promise<MonedaTienda[]> {
  const monedas = await ds.getRepository(Moneda).find({ where: { activo: true } as any, order: { id: 'ASC' } as any });
  const principal = monedas.find((m: any) => m.principal);
  if (!principal) return [];
  const billetes = await ds.getRepository(MonedaBillete).find({ where: { activo: true } as any, relations: ['moneda'] });
  const out: MonedaTienda[] = [];
  for (const m of monedas as any[]) {
    const cotCruda = m.principal ? 1 : await getCotizacionCompraLocal(ds, m.id, principal.id);
    if (!cotCruda) continue;
    // A 4 decimales, la precisión con que se guarda en el pedido (`pago_cotizacion`): lo que se
    // valida, lo que se guarda y lo que muestra el ticket usan el mismo número.
    const cot = Math.round(Number(cotCruda) * 10000) / 10000;
    out.push({
      id: m.id,
      denominacion: m.denominacion,
      simbolo: m.simbolo,
      decimales: Number(m.decimales ?? (m.principal ? 0 : 2)) || 0,
      principal: !!m.principal,
      cotizacion: Number(cot),
      billetes: billetes
        .filter((b: any) => b.moneda?.id === m.id)
        .map((b: any) => Number(b.valor))
        .filter((v) => Number.isFinite(v) && v > 0)
        .sort((a, b) => a - b),
    });
  }
  // La principal primero.
  return out.sort((a, b) => Number(b.principal) - Number(a.principal) || a.id - b.id);
}

/**
 * Todas las monedas (activas o no), sólo con lo que hace falta para MOSTRAR un pago ya
 * registrado: un pedido en US$ tiene que seguir diciendo «paga con US$ 20» aunque después se
 * desactive el dólar (la cotización usada está guardada en el pedido).
 */
export async function monedasParaResumen(ds: DataSource): Promise<Pick<MonedaTienda, 'id' | 'simbolo' | 'decimales' | 'principal'>[]> {
  const todas = await ds.getRepository(Moneda).find({ order: { id: 'ASC' } as any });
  return (todas as any[]).map((m) => ({
    id: m.id, simbolo: m.simbolo, principal: !!m.principal,
    decimales: Number(m.decimales ?? (m.principal ? 0 : 2)) || 0,
  }));
}

/** Total (en la principal) expresado en otra moneda, redondeado HACIA ARRIBA a sus decimales. */
export function totalEnMoneda(totalPrincipal: number, cotizacion: number, decimales: number): number {
  if (!cotizacion || cotizacion <= 0) return NaN;
  const f = Math.pow(10, Math.max(0, decimales));
  // El épsilon evita que 45000/6000 = 7.5000000001 suba a 7.51.
  return Math.ceil((totalPrincipal / cotizacion) * f - 1e-9) / f;
}

export type ResultadoPago =
  | { ok: true; campos: {
      metodoPago: MetodoPagoOnline; pagoModalidad: PagoModalidad; pagoMonedaId: number | null;
      vueltoPara: number | null; pagoCotizacion: number | null; pagoObservacion: string | null;
    } }
  | { ok: false; error: string };

/**
 * Valida y normaliza lo que manda el checkout. `total` es el del SERVIDOR (ya recalculado).
 * El pago online ya pasó su propio control (`pagoOnlineOfrecido`) antes de llegar acá.
 */
export function validarPagoPedido(params: {
  data: any;
  total: number;
  metodoPago: MetodoPagoOnline;
  habilitados: MetodoPagoOnline[];
  monedas: MonedaTienda[];
}): ResultadoPago {
  const { data, total, metodoPago, habilitados, monedas } = params;
  // Sin caracteres de control: Postgres rechaza el NUL y la térmica toma ESC/GS como comandos.
  const obs = data?.pagoObservacion != null
    ? String(data.pagoObservacion).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().toUpperCase().slice(0, 200)
    : '';
  const pagoObservacion = obs || null;

  if (esMetodoPagoOnline(metodoPago)) {
    // Online: no hay moneda ni vuelto (paga el total, en la principal, en el proveedor).
    return { ok: true, campos: { metodoPago, pagoModalidad: PagoModalidad.ONLINE, pagoMonedaId: null, vueltoPara: null, pagoCotizacion: null, pagoObservacion } };
  }
  // F8b: a cuenta. Si la tienda lo ofrece y si ESTE cliente puede lo decide `crear-pedido-online`
  // (cuenta vinculada, crédito, disponible); acá solo se normaliza: sin moneda ni vuelto.
  if (metodoPago === MetodoPagoOnline.CREDITO) {
    return { ok: true, campos: { metodoPago, pagoModalidad: PagoModalidad.A_CUENTA, pagoMonedaId: null, vueltoPara: null, pagoCotizacion: null, pagoObservacion } };
  }
  if (!habilitados.includes(metodoPago)) return { ok: false, error: 'metodo_pago_no_disponible' };
  if (metodoPago !== MetodoPagoOnline.EFECTIVO) {
    return { ok: true, campos: { metodoPago, pagoModalidad: PagoModalidad.AL_RECIBIR, pagoMonedaId: null, vueltoPara: null, pagoCotizacion: null, pagoObservacion } };
  }

  // Efectivo: moneda (default la principal) y, si necesita vuelto, con cuánto paga.
  const principal = monedas.find((m) => m.principal);
  // Sin moneda principal configurada (instalación a medio armar): el efectivo se acepta como
  // antes de F8, sin moneda ni «paga con» — nunca se bloquea un pedido en efectivo por esto.
  if (!principal) {
    return { ok: true, campos: { metodoPago, pagoModalidad: PagoModalidad.AL_RECIBIR, pagoMonedaId: null, vueltoPara: null, pagoCotizacion: null, pagoObservacion } };
  }
  const monedaId = data?.pagoMonedaId != null && data.pagoMonedaId !== '' ? Number(data.pagoMonedaId) : principal?.id;
  const moneda = monedas.find((m) => m.id === monedaId);
  if (!moneda) return { ok: false, error: 'moneda_no_disponible' };

  let vueltoPara: number | null = null;
  if (data?.vueltoPara != null && data.vueltoPara !== '') {
    const v = Number(data.vueltoPara);
    if (!Number.isFinite(v) || v <= 0) return { ok: false, error: 'vuelto_invalido' };
    const f = Math.pow(10, moneda.decimales);
    const vRed = Math.round(v * f) / f;
    // Tiene que alcanzar para pagar: igual al total no necesita vuelto, menos no paga.
    if (vRed + 1e-9 < totalEnMoneda(total, moneda.cotizacion, moneda.decimales) || vRed * moneda.cotizacion <= total) {
      return { ok: false, error: 'vuelto_insuficiente' };
    }
    // Tope: nadie paga con 100 veces el total; un valor así es un error de tipeo o basura.
    if (vRed * moneda.cotizacion > Math.max(total, 1) * 100) return { ok: false, error: 'vuelto_invalido' };
    vueltoPara = vRed;
  }
  return {
    ok: true,
    campos: {
      metodoPago, pagoModalidad: PagoModalidad.AL_RECIBIR,
      pagoMonedaId: moneda.id, vueltoPara,
      pagoCotizacion: moneda.principal ? null : moneda.cotizacion,
      pagoObservacion,
    },
  };
}

const NOMBRE_METODO: Record<string, string> = {
  EFECTIVO: 'EFECTIVO', TARJETA_POS: 'TARJETA (POS)', QR: 'QR', PIX: 'PIX',
  TRANSFERENCIA: 'TRANSFERENCIA', CREDITO: 'A CUENTA', UPAY: 'TARJETA ONLINE (UPAY)', BANCARD: 'TARJETA ONLINE (BANCARD)', PAGOPAR: 'PAGOPAR', ICPAY: 'PAGO ONLINE (IC PAY)',
};

function fmt(v: number, decimales: number): string {
  return v.toLocaleString('es-PY', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/**
 * Texto del pago para la bandeja, el ticket de delivery y el panel de delivery (MAYÚSCULAS, como
 * el resto del ticket). Pedidos anteriores a F8 (columnas en null) → sólo el método.
 *   «EFECTIVO · PAGA CON US$ 20,00 (≈ ₲ 120.000) · VUELTO ₲ 75.000»
 *   «QR · AL RECIBIR»
 */
export function resumenPago(p: {
  metodoPago?: string | null; pagoModalidad?: string | null; pagoMonedaId?: number | null;
  vueltoPara?: any; pagoCotizacion?: any; total?: any;
}, monedas: Pick<MonedaTienda, 'id' | 'simbolo' | 'decimales' | 'principal'>[]): string {
  const metodo = NOMBRE_METODO[String(p.metodoPago || 'EFECTIVO')] || String(p.metodoPago || 'EFECTIVO').toUpperCase();
  if (esMetodoPagoOnline(p.metodoPago)) return metodo;
  if (p.metodoPago === MetodoPagoOnline.CREDITO) return `${metodo} DEL CLIENTE`;
  // Pedido anterior a F8 (sin modalidad): no se sabe si necesitaba vuelto; sólo el método.
  if (!p.pagoModalidad) return metodo;
  const partes = [metodo];
  const principal = monedas.find((m) => m.principal);
  const moneda = p.pagoMonedaId != null ? monedas.find((m) => m.id === Number(p.pagoMonedaId)) : principal;
  const vuelto = p.vueltoPara != null ? Number(p.vueltoPara) : null;
  if (p.metodoPago === 'EFECTIVO' && moneda) {
    if (!moneda.principal) partes.push(`EN ${moneda.simbolo}`);
    if (vuelto != null && Number.isFinite(vuelto)) {
      const cot = moneda.principal ? 1 : Number(p.pagoCotizacion) || 0;
      const enPrincipal = vuelto * cot;
      const simP = principal?.simbolo || '';
      partes.push(moneda.principal
        ? `PAGA CON ${simP} ${fmt(vuelto, moneda.decimales)}`
        : `PAGA CON ${moneda.simbolo} ${fmt(vuelto, moneda.decimales)}${cot ? ` (≈ ${simP} ${fmt(Math.round(enPrincipal), 0)})` : ''}`);
      const total = Number(p.total) || 0;
      if (cot && total) partes.push(`VUELTO ${simP} ${fmt(Math.max(0, Math.round(enPrincipal - total)), principal?.decimales ?? 0)}`);
    } else {
      partes.push('SIN VUELTO');
    }
  } else if (p.pagoModalidad === 'AL_RECIBIR') {
    partes.push('AL RECIBIR');
  }
  return partes.join(' · ');
}

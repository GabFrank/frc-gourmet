/**
 * Decide qué significa la respuesta de uPay para un pedido (PLAN-tienda-online F4 §3, §9).
 * Función pura: sin base ni red, para probar cada combinación.
 *
 * Regla de oro: PAGADO solo con sesión `complete` + payment `SUCCEEDED` (APPROVED|CAPTURED)
 * + monto/moneda/referencia iguales a los del pedido. Lo que no está en las listas
 * (o no se pudo leer) queda PENDIENTE y se vuelve a consultar.
 */
export type ResultadoPago =
  | { tipo: 'PAGADO'; paymentId: string; monto: number; detalle: string }
  | { tipo: 'FALLIDO'; paymentId: string | null; detalle: string }
  | { tipo: 'EXPIRADO'; detalle: string }
  | { tipo: 'PENDIENTE'; detalle: string; paymentId?: string | null }
  /** El proveedor dice cobrado pero no coincide con el pedido: no se da por pagado y se avisa. */
  | { tipo: 'INCONSISTENTE'; paymentId: string | null; detalle: string };

const FALLIDOS = ['DECLINED', 'REJECTED', 'ERROR', 'FRAUD', 'CANCELED', 'EXPIRED'];
const SUB_COBRADO = ['APPROVED', 'CAPTURED'];

export interface EsperadoPago {
  monto: number;
  referencia: string; // operationReferenceId del intento
}

/** Sesión: `open | complete | expired`. */
export function interpretarSesion(sesion: any): { estado: 'open' | 'complete' | 'expired' | 'desconocido'; paymentId: string | null } {
  const st = String(sesion?.status ?? '').toLowerCase();
  const paymentId = sesion?.paymentId != null ? String(sesion.paymentId) : null;
  if (st === 'open' || st === 'complete' || st === 'expired') return { estado: st, paymentId };
  return { estado: 'desconocido', paymentId };
}

/** Monto string/num de uPay a número (guaraníes, sin decimales). NaN si no se entiende. */
export function montoUpay(v: any): number {
  if (v == null) return NaN;
  const s = String(typeof v === 'object' ? v.value : v).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export function interpretarPago(sesion: any, pago: any, esperado: EsperadoPago): ResultadoPago {
  const ses = interpretarSesion(sesion);
  if (ses.estado === 'expired') return { tipo: 'EXPIRADO', detalle: 'sesión vencida en uPay' };
  if (ses.estado === 'open') return { tipo: 'PENDIENTE', detalle: 'sesión abierta (sin pagar todavía)' };
  if (ses.estado !== 'complete') return { tipo: 'PENDIENTE', detalle: `estado de sesión desconocido: ${String(sesion?.status ?? '—')}` };
  if (!ses.paymentId) return { tipo: 'PENDIENTE', detalle: 'sesión completa sin paymentId todavía' };
  if (!pago) return { tipo: 'PENDIENTE', detalle: 'falta consultar el pago', paymentId: ses.paymentId };

  const status = String(pago?.status ?? '').toUpperCase();
  const sub = String(pago?.subStatus ?? '').toUpperCase();
  if (FALLIDOS.includes(status)) {
    return { tipo: 'FALLIDO', paymentId: ses.paymentId, detalle: `${status}${sub ? '/' + sub : ''}` };
  }
  if (status !== 'SUCCEEDED' || !SUB_COBRADO.includes(sub)) {
    return { tipo: 'PENDIENTE', detalle: `pago ${status || '—'}/${sub || '—'}`, paymentId: ses.paymentId };
  }

  // Cobrado: tiene que ser ESTE pedido y ESTE monto. F5 (plan §12): monto y moneda salen del
  // PAGO (GET /payments/{id}/status, que según la doc trae amount {value, currency}); sin
  // fallback a la sesión, que solo dice lo que se pidió cobrar, no lo cobrado.
  if (pago?.amount == null || typeof pago.amount !== 'object' || pago.amount.currency == null) {
    return { tipo: 'INCONSISTENTE', paymentId: ses.paymentId, detalle: 'el pago no informa monto y moneda' };
  }
  const monto = montoUpay(pago.amount);
  const moneda = String(pago.amount.currency).toUpperCase();
  // La doc no deja claro en qué campo vuelve operationReferenceId (merchant.referenceId u
  // orderId; en el ejemplo de la doc orderId es otro valor): en la sesión vale cualquiera. Si el
  // PAGO trae merchant.seller.operationReferenceId, tiene que ser el del intento.
  const refs = [
    sesion?.merchant?.referenceId, sesion?.merchant?.orderId, sesion?.merchant?.seller?.operationReferenceId,
  ].filter((r) => r != null).map(String);
  const refPago = pago?.merchant?.seller?.operationReferenceId;
  if (refPago != null && String(refPago) !== esperado.referencia) {
    return { tipo: 'INCONSISTENTE', paymentId: ses.paymentId, detalle: `referencia del pago ${refPago} ≠ ${esperado.referencia}` };
  }
  const ref = refs.length && !refs.includes(esperado.referencia) ? refs.join('|') : null;
  if (!Number.isFinite(monto) || Math.round(monto) !== Math.round(esperado.monto)) {
    return { tipo: 'INCONSISTENTE', paymentId: ses.paymentId, detalle: `monto ${monto} ≠ pedido ${esperado.monto}` };
  }
  if (moneda !== 'PYG') {
    return { tipo: 'INCONSISTENTE', paymentId: ses.paymentId, detalle: `moneda ${moneda}` };
  }
  if (ref != null) {
    return { tipo: 'INCONSISTENTE', paymentId: ses.paymentId, detalle: `referencia ${ref} ≠ ${esperado.referencia}` };
  }
  return { tipo: 'PAGADO', paymentId: ses.paymentId, monto, detalle: `${status}/${sub}` };
}

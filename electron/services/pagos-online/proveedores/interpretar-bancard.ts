/**
 * Qué significa una confirmación de Bancard para un pedido. Función pura (sin red ni base).
 *
 * Misma regla de oro que uPay: PAGADO solo si Bancard dice aprobado (`response = 'S'` y
 * `response_code = '00'`), el token de la confirmación es el que corresponde a ESTE cobro (lo arma
 * Bancard con nuestra clave privada: nadie más puede falsificarlo) y monto y moneda coinciden.
 * Lo que no se entiende queda PENDIENTE y se vuelve a consultar.
 */
import { ResultadoPago } from '../interpretar-pago';
import { mismoToken, montoBancard, tokenConfirmacion } from './bancard-vpos.client';

export interface EsperadoBancard {
  privateKey: string;
  spid: number;
  monto: number;
  /**
   * Aviso (webhook): la firma es obligatoria, es lo único que prueba que lo mandó Bancard.
   * Consulta: la respuesta viene directo de Bancard por TLS; si trae firma, se verifica igual.
   */
  exigirFirma?: boolean;
}

/** El id del pago para el índice único: el ticket de Bancard (o la autorización, o el proceso). */
function idPago(c: any, spid: number): string {
  return String(c?.ticket_number || c?.authorization_number || `spid-${spid}`);
}

export function interpretarConfirmacionBancard(c: any, esperado: EsperadoBancard): ResultadoPago {
  if (!c || typeof c !== 'object') return { tipo: 'PENDIENTE', detalle: 'confirmación vacía' };
  const response = String(c.response ?? '').toUpperCase();
  const codigo = String(c.response_code ?? '');
  const detalle = [response, codigo, c.response_description || c.response_details].filter(Boolean).join(' ').slice(0, 200);

  if (String(c.shop_process_id ?? esperado.spid) !== String(esperado.spid)) {
    return { tipo: 'INCONSISTENTE', paymentId: null, detalle: `proceso ${c.shop_process_id} ≠ ${esperado.spid}` };
  }
  const amount = String(c.amount ?? '');
  const moneda = String(c.currency ?? '').toUpperCase();
  // El token prueba que la confirmación la armó Bancard con nuestra clave y para este monto.
  // OJO: no cubre `response`: un aviso rechazado y uno aprobado del mismo cobro llevan el mismo
  // token. Por eso el aviso nunca decide solo (ver `procesarAvisoPago`): dispara una consulta.
  const firmaOk = !!c.token && mismoToken(String(c.token), tokenConfirmacion(esperado.privateKey, esperado.spid, amount, moneda || 'PYG'));
  if ((esperado.exigirFirma && !firmaOk) || (c.token && !firmaOk)) {
    return { tipo: 'INCONSISTENTE', paymentId: null, detalle: 'token de confirmación inválido' };
  }
  if (response === 'N') return { tipo: 'FALLIDO', paymentId: null, detalle: detalle || 'rechazado' };
  if (response !== 'S' || codigo !== '00') return { tipo: 'PENDIENTE', detalle: `respuesta ${response || '—'}/${codigo || '—'}` };

  if (amount !== montoBancard(esperado.monto)) {
    return { tipo: 'INCONSISTENTE', paymentId: idPago(c, esperado.spid), detalle: `monto ${amount} ≠ pedido ${montoBancard(esperado.monto)}` };
  }
  if (moneda !== 'PYG') return { tipo: 'INCONSISTENTE', paymentId: idPago(c, esperado.spid), detalle: `moneda ${moneda || '—'}` };
  return { tipo: 'PAGADO', paymentId: idPago(c, esperado.spid), monto: Number(amount), detalle: detalle || 'aprobado' };
}

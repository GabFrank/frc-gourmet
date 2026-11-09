/**
 * Pago con tarjeta online (PLAN-tienda-online F4; proveedores en PLAN-tienda-pagos-proveedores).
 * La tienda solo va (o carga el script de pago) a los hosts del proveedor que publica el servidor
 * (`tienda.config` → `pagoOnlineHosts`): https y host exacto o subdominio con punto.
 */
const HOSTS_UPAY = ['upay.com', 'upay.com.py'];

export function esUrlPagoPermitida(url: string, hosts?: string[] | null): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  const permitidos = hosts && hosts.length ? hosts : HOSTS_UPAY;
  return permitidos.some((d) => h === d || h.endsWith('.' + d));
}

/** Compat: los tests y llamadores de F4. */
export function esUrlCheckoutUpay(url: string): boolean {
  return esUrlPagoPermitida(url, HOSTS_UPAY);
}

/** Métodos que son un proveedor de pago online (el cliente pagó antes). */
export function esMetodoPagoOnline(m: string | null | undefined): boolean {
  return ['UPAY', 'BANCARD', 'ICPAY'].includes(String(m || '').toUpperCase());
}

/** El pago online es un Pix (IC Pay): cambian los textos («tarjeta» no aplica). */
export function esPagoPix(m: string | null | undefined): boolean {
  return String(m || '').toUpperCase() === 'ICPAY';
}

export type EstadoPago = 'PENDIENTE' | 'PAGADO' | 'FALLIDO' | 'EXPIRADO' | 'REEMBOLSO_PENDIENTE' | 'DEVOLVIENDO' | 'DEVUELTO'
  | 'NO_ACREDITADO' | 'RETENIDO';

/** Texto para el cliente según el estado del pago. `metodo` = el del pedido (Pix o tarjeta). */
export function textoEstadoPago(e: string | null | undefined, monto?: number | null, metodo?: string | null): string | null {
  const pix = esPagoPix(metodo);
  const pago = pix ? 'pago con Pix' : 'pago con tarjeta';
  const Pago = pix ? 'El pago con Pix' : 'El pago con tarjeta';
  const montoTxt = monto != null ? '₲' + Math.round(monto).toLocaleString('es-PY') : 'el pago';
  switch (e) {
    case 'PENDIENTE': return `Esperando la confirmación del ${pago}.`;
    case 'PAGADO': return pix ? 'Pagado con Pix.' : 'Pagado con tarjeta.';
    case 'FALLIDO': return `${Pago} no se completó. Podés intentar de nuevo.`;
    case 'EXPIRADO': return `${Pago} no se completó a tiempo.`;
    case 'REEMBOLSO_PENDIENTE':
      return pix
        ? `Te devolvemos ${montoTxt}. El local se comunica con vos para la devolución del Pix.`
        : `Te devolvemos ${montoTxt} a tu tarjeta. Puede tardar lo que indique tu banco.`;
    case 'DEVOLVIENDO':
    case 'DEVUELTO': return pix ? 'Te devolvimos el pago.' : 'Te devolvimos el pago a tu tarjeta.';
    // El local registró que el cobro no llegó a acreditarse: no hay nada que devolver.
    case 'NO_ACREDITADO': return `${Pago} no llegó a acreditarse.`;
    // El local decidió no devolver: el detalle lo da el local, no la tienda.
    case 'RETENIDO': return `${Pago} no se devuelve. Por dudas, comunicate con el local.`;
    default: return null;
  }
}

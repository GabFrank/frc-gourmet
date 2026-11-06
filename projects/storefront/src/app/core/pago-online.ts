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
  return ['UPAY', 'BANCARD'].includes(String(m || '').toUpperCase());
}

export type EstadoPago = 'PENDIENTE' | 'PAGADO' | 'FALLIDO' | 'EXPIRADO' | 'REEMBOLSO_PENDIENTE' | 'DEVOLVIENDO' | 'DEVUELTO'
  | 'NO_ACREDITADO' | 'RETENIDO';

/** Texto para el cliente según el estado del pago. */
export function textoEstadoPago(e: string | null | undefined, monto?: number | null): string | null {
  switch (e) {
    case 'PENDIENTE': return 'Esperando la confirmación del pago con tarjeta.';
    case 'PAGADO': return 'Pagado con tarjeta.';
    case 'FALLIDO': return 'El pago con tarjeta no se aprobó. Podés intentar de nuevo.';
    case 'EXPIRADO': return 'El pago con tarjeta no se completó a tiempo.';
    case 'REEMBOLSO_PENDIENTE':
      return `Te devolvemos ${monto != null ? '₲' + Math.round(monto).toLocaleString('es-PY') : 'el pago'} a tu tarjeta. Puede tardar lo que indique tu banco.`;
    case 'DEVOLVIENDO':
    case 'DEVUELTO': return 'Te devolvimos el pago a tu tarjeta.';
    // El local registró que el cobro no llegó a acreditarse: no hay nada que devolver.
    case 'NO_ACREDITADO': return 'El pago con tarjeta no llegó a acreditarse.';
    // El local decidió no devolver: el detalle lo da el local, no la tienda.
    case 'RETENIDO': return 'El pago con tarjeta no se devuelve. Por dudas, comunicate con el local.';
    default: return null;
  }
}

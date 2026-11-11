/**
 * Pago con tarjeta por uPay (PLAN-tienda-online F4). La tienda solo redirige a uPay: https y
 * host exacto o subdominio con punto (mismo criterio que el servidor).
 */
export function esUrlCheckoutUpay(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return ['upay.com', 'upay.com.py'].some((d) => h === d || h.endsWith('.' + d));
}

export type EstadoPago = 'PENDIENTE' | 'PAGADO' | 'FALLIDO' | 'EXPIRADO' | 'REEMBOLSO_PENDIENTE' | 'DEVUELTO';

/** Texto para el cliente según el estado del pago. */
export function textoEstadoPago(e: string | null | undefined, monto?: number | null): string | null {
  switch (e) {
    case 'PENDIENTE': return 'Esperando la confirmación del pago con tarjeta.';
    case 'PAGADO': return 'Pagado con tarjeta.';
    case 'FALLIDO': return 'El pago con tarjeta no se aprobó. Podés intentar de nuevo.';
    case 'EXPIRADO': return 'El pago con tarjeta no se completó a tiempo.';
    case 'REEMBOLSO_PENDIENTE':
      return `Te devolvemos ${monto != null ? '₲' + Math.round(monto).toLocaleString('es-PY') : 'el pago'} a tu tarjeta. Puede tardar lo que indique tu banco.`;
    case 'DEVUELTO': return 'Te devolvimos el pago a tu tarjeta.';
    default: return null;
  }
}

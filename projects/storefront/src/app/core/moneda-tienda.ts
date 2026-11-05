/**
 * Monedas de la tienda (F8), sin Angular: se testea en Node.
 *
 * La moneda que elige el cliente es SÓLO visual: por detrás todo es guaraní (la principal) y el
 * servidor calcula el total como siempre. Para pagar en efectivo con otra moneda, el «paga con»
 * se compara contra el total expresado en esa moneda, redondeado hacia arriba (lo mismo que
 * valida el servidor en `pago-pedido.utils.ts`).
 */
export interface MonedaTienda {
  id: number;
  denominacion: string;
  simbolo: string;
  decimales: number;
  principal: boolean;
  /** Unidades de la principal por 1 unidad de esta (compraLocal). 1 en la principal. */
  cotizacion: number;
  billetes: number[];
}

/** Monto en la principal → en `m`, redondeado hacia arriba a sus decimales (igual que el servidor). */
export function convertir(valorPrincipal: number, m: Pick<MonedaTienda, 'cotizacion' | 'decimales' | 'principal'>): number {
  const v = Number(valorPrincipal) || 0;
  if (m.principal || !m.cotizacion) return Math.round(v);
  const f = Math.pow(10, Math.max(0, m.decimales));
  return Math.ceil((v / m.cotizacion) * f - 1e-9) / f;
}

export function formatear(valor: number, m: Pick<MonedaTienda, 'simbolo' | 'decimales'>): string {
  const d = Math.max(0, m.decimales);
  return `${m.simbolo} ${new Intl.NumberFormat('es-PY', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(valor) || 0)}`;
}

/**
 * Sugerencias para «Vuelto para»: montos redondos con los billetes de esa moneda, SIEMPRE
 * mayores al total. Para cada billete que valga al menos el 10 % del total (con monedas chicas
 * saldrían montos inútiles como 45.500), el primer múltiplo que pasa el total; sin repetidos,
 * de menor a mayor, hasta `max`. Ej.: total 45.000 con billetes de ₲ 500 a 100.000 →
 * 50.000, 60.000, 100.000. Sin billetes cargados → ninguna (queda el campo libre).
 */
export function sugerenciasVuelto(totalEnMoneda: number, billetes: number[], max = 4): number[] {
  const total = Number(totalEnMoneda) || 0;
  const out = new Set<number>();
  for (const b of billetes || []) {
    if (!(b > 0) || b < total * 0.1) continue;
    let k = Math.ceil(total / b - 1e-9) * b;
    if (k <= total + 1e-9) k += b;
    out.add(Math.round(k * 100) / 100);
  }
  return [...out].filter((v) => v > total).sort((a, b) => a - b).slice(0, max);
}

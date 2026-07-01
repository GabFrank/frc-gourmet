import { ConteoGrupo } from './conteo-form.component';

function fmt(v: any, decimales: number): string {
  return Number(v || 0).toLocaleString('es-PY', { maximumFractionDigits: decimales || 0 });
}

/**
 * Arma los grupos de conteo (uno por moneda habilitada en caja) con sus
 * denominaciones activas, a partir de las cajas-monedas y los billetes.
 * `cajasMonedas`: CajaMoneda[] (relación moneda, activo, orden).
 * `billetes`: MonedaBillete[] (relación moneda, valor, activo).
 */
export function buildGruposConteo(cajasMonedas: any[], billetes: any[]): ConteoGrupo[] {
  const activas = (cajasMonedas || [])
    .filter((cm) => cm && cm.activo && cm.moneda)
    .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));

  const grupos: ConteoGrupo[] = [];
  for (const cm of activas) {
    const moneda = cm.moneda;
    const decimales = Number(moneda.decimales || 0);
    const bills = (billetes || [])
      .filter((b) => b && b.activo && b.moneda && b.moneda.id === moneda.id)
      .sort((a, b) => Number(b.valor) - Number(a.valor)); // mayor a menor
    if (!bills.length) continue;
    grupos.push({
      monedaId: moneda.id,
      denominacion: String(moneda.denominacion || '').toUpperCase(),
      simbolo: moneda.simbolo || '',
      decimales,
      billetes: bills.map((b) => ({
        billeteId: b.id,
        valor: Number(b.valor),
        valorFmt: fmt(b.valor, decimales),
        cantidad: null,
      })),
      subtotal: 0,
      subtotalFmt: fmt(0, decimales),
    });
  }
  return grupos;
}

/** ConteoDetalle a persistir: una fila por denominación con cantidad > 0. */
export function detallesDeGrupos(grupos: ConteoGrupo[]): { monedaBillete: { id: number }; cantidad: number; activo: boolean }[] {
  const out: { monedaBillete: { id: number }; cantidad: number; activo: boolean }[] = [];
  for (const g of grupos) {
    for (const b of g.billetes) {
      const cant = Number(b.cantidad) || 0;
      if (cant > 0) out.push({ monedaBillete: { id: b.billeteId }, cantidad: cant, activo: true });
    }
  }
  return out;
}

/** Total contado por moneda (para mostrar/validar). */
export function totalesDeGrupos(grupos: ConteoGrupo[]): { monedaId: number; total: number }[] {
  return grupos.map((g) => ({ monedaId: g.monedaId, total: g.subtotal }));
}

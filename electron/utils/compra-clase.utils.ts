/**
 * Clasificación de ítems de compra (docs/planes/PLAN-clasificacion-items-compras.md).
 * Funciones puras: se testean en scripts/test-clasificacion-compras-e2e.ts.
 */

export interface ProductoParaClase {
  claseId?: number | null;
  subfamilia?: { claseId?: number | null } | null;
}

/**
 * Clase efectiva de una línea: la de la línea (override) ?? la del producto ??
 * la de su subfamilia ?? null («Sin clasificar»).
 */
export function resolverClaseLinea(
  claseLinea: number | null | undefined,
  producto: ProductoParaClase | null | undefined,
): number | null {
  const n = (v: any) => (v === undefined || v === null || v === '' ? null : Number(v));
  return n(claseLinea) ?? n(producto?.claseId) ?? n(producto?.subfamilia?.claseId) ?? null;
}

export interface ClaseReporte { id: number; nombre: string; destino: string; activo: boolean }
export interface CompraReporte { id: number; total: number; monedaId: number | null; simplificada: boolean }
export interface LineaReporte { compraId: number; subtotal: number; claseId: number | null }

export interface FilaReporteClase {
  monedaId: number | null;
  destino: string;          // CMV | GASTO_OPERATIVO | REVENTA | SIN_CLASIFICAR | SIN_DETALLE
  claseId: number | null;
  clase: string;
  claseActiva: boolean;
  monto: number;
  lineas: number;
}

export interface ReporteComprasPorClase {
  filas: FilaReporteClase[];
  porMoneda: { monedaId: number | null; totalCompras: number; totalReporte: number; diferencia: number }[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Agrupa el monto de las compras por destino y clase, por moneda y sin convertir.
 * El monto de cada línea es su subtotal prorrateado para que la suma de las líneas
 * de una compra dé su total de cabecera (diferencia 0 por compra). Las compras
 * simplificadas o sin líneas salen como «Sin detalle» con su total.
 */
export function agruparReporteCompras(
  compras: CompraReporte[],
  lineas: LineaReporte[],
  clases: ClaseReporte[],
): ReporteComprasPorClase {
  const clasesPorId = new Map(clases.map((c) => [Number(c.id), c]));
  const lineasPorCompra = new Map<number, LineaReporte[]>();
  for (const l of lineas) {
    const arr = lineasPorCompra.get(Number(l.compraId)) || [];
    arr.push(l);
    lineasPorCompra.set(Number(l.compraId), arr);
  }

  const filas = new Map<string, FilaReporteClase>();
  const sumar = (monedaId: number | null, destino: string, claseId: number | null, clase: string, activa: boolean, monto: number) => {
    const k = `${monedaId}|${destino}|${claseId}`;
    const f = filas.get(k) || { monedaId, destino, claseId, clase, claseActiva: activa, monto: 0, lineas: 0 };
    f.monto += monto;
    f.lineas += 1;
    filas.set(k, f);
  };

  const totales = new Map<number | null, { totalCompras: number; totalReporte: number }>();
  for (const c of compras) {
    const total = Number(c.total) || 0;
    const t = totales.get(c.monedaId) || { totalCompras: 0, totalReporte: 0 };
    t.totalCompras += total;
    totales.set(c.monedaId, t);

    const ls = c.simplificada ? [] : (lineasPorCompra.get(Number(c.id)) || []);
    const suma = ls.reduce((s, l) => s + (Number(l.subtotal) || 0), 0);
    if (!ls.length || suma === 0) {
      sumar(c.monedaId, 'SIN_DETALLE', null, 'Sin detalle', true, total);
      t.totalReporte += total;
      continue;
    }
    // Prorrateo: la última línea absorbe el redondeo para cerrar exacto con el total.
    let asignado = 0;
    ls.forEach((l, i) => {
      const monto = i === ls.length - 1 ? r2(total - asignado) : r2((Number(l.subtotal) || 0) * total / suma);
      asignado = r2(asignado + monto);
      const clase = l.claseId != null ? clasesPorId.get(Number(l.claseId)) : undefined;
      if (clase) sumar(c.monedaId, clase.destino, clase.id, clase.nombre, !!clase.activo, monto);
      else sumar(c.monedaId, 'SIN_CLASIFICAR', null, 'Sin clasificar', true, monto);
    });
    t.totalReporte += asignado;
  }

  const orden: Record<string, number> = { CMV: 1, REVENTA: 2, GASTO_OPERATIVO: 3, SIN_CLASIFICAR: 4, SIN_DETALLE: 5 };
  return {
    filas: [...filas.values()]
      .map((f) => ({ ...f, monto: r2(f.monto) }))
      .sort((a, b) => (Number(a.monedaId) - Number(b.monedaId)) || (orden[a.destino] - orden[b.destino]) || (b.monto - a.monto)),
    porMoneda: [...totales.entries()].map(([monedaId, t]) => ({
      monedaId,
      totalCompras: r2(t.totalCompras),
      totalReporte: r2(t.totalReporte),
      diferencia: r2(t.totalCompras - t.totalReporte),
    })),
  };
}

/**
 * Agregación de métricas de buffet por peso. Lógica PURA y testeable.
 * Calcula KPIs a partir de los items de venta de buffet y los kg producidos.
 */

export interface BuffetItemMetrica {
  pesoNetoGramos: number;
  total: number;
  costo: number;
  aplicoLibre: boolean;
  ventaId: number;
}

export interface BuffetMetricasResult {
  cantidadItems: number;
  cantidadVentas: number;
  kgVendidos: number;
  kgProducidos: number;
  desperdicioKg: number;
  pesoMedioGramosPorVenta: number;
  ingresoTotal: number;
  costoTotal: number;
  cmvPorcentaje: number;
  ticketsLibre: number;
  porcentajeLibre: number;
}

export function resumirMetricasBuffet(
  items: BuffetItemMetrica[],
  kgProducidos: number,
): BuffetMetricasResult {
  const lista = items || [];
  const ventas = new Set<number>();
  let pesoNetoGramos = 0;
  let ingresoTotal = 0;
  let costoTotal = 0;
  let ticketsLibre = 0;

  for (const it of lista) {
    pesoNetoGramos += Number(it.pesoNetoGramos) || 0;
    ingresoTotal += Number(it.total) || 0;
    costoTotal += Number(it.costo) || 0;
    if (it.aplicoLibre) ticketsLibre++;
    if (it.ventaId != null) ventas.add(it.ventaId);
  }

  const cantidadVentas = ventas.size;
  const kgVendidos = pesoNetoGramos / 1000;
  const produced = Number(kgProducidos) || 0;

  return {
    cantidadItems: lista.length,
    cantidadVentas,
    kgVendidos: Math.round(kgVendidos * 1000) / 1000,
    kgProducidos: Math.round(produced * 1000) / 1000,
    desperdicioKg: Math.round((produced - kgVendidos) * 1000) / 1000,
    pesoMedioGramosPorVenta:
      cantidadVentas > 0 ? Math.round(pesoNetoGramos / cantidadVentas) : 0,
    ingresoTotal: Math.round(ingresoTotal * 100) / 100,
    costoTotal: Math.round(costoTotal * 100) / 100,
    cmvPorcentaje: ingresoTotal > 0 ? Math.round((costoTotal / ingresoTotal) * 1000) / 10 : 0,
    ticketsLibre,
    porcentajeLibre: lista.length > 0 ? Math.round((ticketsLibre / lista.length) * 1000) / 10 : 0,
  };
}

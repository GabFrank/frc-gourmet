import { DataSource } from 'typeorm';
import { resolverPeriodo } from './reportes-periodo.util';
import type { ReportePeriodoParams } from './reportes.handler';

/**
 * Reporte de cierre de mes — Finanzas. Agregaciones de solo lectura (flujo de
 * caja, gastos, aging CPC/CPP, comisiones POS, vencimientos). Fase 3 completa el
 * cuerpo; Fase 0 devuelve el período resuelto + secciones vacías.
 */
export async function construirReporteFinanzasCierre(
  _dataSource: DataSource,
  params: ReportePeriodoParams,
): Promise<any> {
  const periodo = resolverPeriodo(params);
  return {
    periodoLabel: periodo.label,
    periodoLabelAnterior: periodo.labelAnterior,
    kpis: null,
    flujoCaja: { labels: [], ingresos: [], egresos: [], neto: [] },
    composicionIngresos: [],
    composicionEgresos: [],
    gastosPorCategoria: [],
    aging: { porCobrar: null, porPagar: null },
    comisionesPos: { total: 0, facturado: 0, pctPromedio: 0, porMaquina: [] },
    vencimientos: [],
    placeholder: true,
  };
}

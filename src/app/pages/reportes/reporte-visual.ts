/**
 * Constantes visuales y helpers compartidos por las pantallas de Reportes.
 * La paleta categórica está validada para daltonismo/contraste (dataviz).
 */

export const REPORTE_ROJO = '#db392e';      // rojo primario del sistema
export const REPORTE_AZUL = '#2a78d6';
export const REPORTE_NARANJA = '#eb6834';
export const REPORTE_VERDE = '#1baf7a';
export const REPORTE_AMARILLO = '#eda100';
export const REPORTE_MAGENTA = '#e87ba4';
export const REPORTE_GRIS = '#9aa0a6';
/** Paleta categórica validada (blue, orange, aqua, yellow, magenta). */
export const REPORTE_CATEGORICA = [REPORTE_AZUL, REPORTE_NARANJA, REPORTE_VERDE, REPORTE_AMARILLO, REPORTE_MAGENTA];

/** Miles con separador '.' (formato PYG). */
export function formatNum(n: number): string {
  const v = Math.round(Number(n) || 0);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
export function formatGs(n: number): string {
  return '₲ ' + formatNum(n);
}
/** Porcentaje/decimal con coma, hasta 1 decimal (es-PY). */
export function formatDec(n: number): string {
  const v = Number(n) || 0;
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ',');
}

export interface KpiCard {
  label: string;
  valor: string;
  tieneDelta: boolean;
  deltaTexto: string;
  dir: 'up' | 'down';
  buena: boolean;
}

/**
 * KPI con variación. `invertido` = true cuando una BAJA es lo bueno (ej. deuda
 * vencida). `sufijo`: '%' (default, pegado) o 'pts'/'' (con espacio).
 */
export function buildKpiCard(
  label: string,
  valor: string,
  variacion: number | null,
  opts: { sufijo?: string; invertido?: boolean } = {},
): KpiCard {
  const sufijo = opts.sufijo ?? '%';
  if (variacion == null) {
    return { label, valor, tieneDelta: false, deltaTexto: '', dir: 'up', buena: true };
  }
  const dir: 'up' | 'down' = variacion >= 0 ? 'up' : 'down';
  const buena = opts.invertido ? variacion <= 0 : variacion >= 0;
  const abs = formatDec(Math.abs(variacion));
  const deltaTexto = sufijo === '%' ? `${abs}%` : `${abs} ${sufijo}`.trim();
  return { label, valor, tieneDelta: true, deltaTexto, dir, buena };
}

/** KPI cuyo valor ES un porcentaje; la variación se expresa en puntos. */
export function buildKpiCardPct(label: string, valorPct: number, variacionPts: number | null): KpiCard {
  return buildKpiCard(label, `${formatDec(valorPct)}%`, variacionPts, { sufijo: 'pts' });
}

export interface HeatCelda { dia: string; hora: number; valor: number; opacidad: number; }
export interface HeatmapVM {
  dias: string[];
  horas: number[];
  celdas: HeatCelda[][];
  max: number;
}

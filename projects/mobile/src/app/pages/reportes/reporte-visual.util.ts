import { Chart, registerables, ChartConfiguration } from 'chart.js';

/**
 * Utilidades visuales de los reportes mobile: paleta de marca, helpers de
 * formato y opciones de gráfico touch-friendly para pantalla chica.
 * El registro de controllers de chart.js es defensivo (ng2-charts v4 ya los
 * registra al importar NgChartsModule; esta llamada extra es idempotente).
 */
Chart.register(...registerables);

// Paleta de marca (rojo del sistema) + categórica validada.
export const REP_ROJO = '#db392e';
export const REP_AZUL = '#2a78d6';
export const REP_NARANJA = '#eb6834';
export const REP_VERDE = '#1baf7a';
export const REP_AMARILLO = '#eda100';
export const REP_MAGENTA = '#e87ba4';
export const REP_GRIS = '#9aa0a6';
export const REP_CATEGORICA = [REP_AZUL, REP_NARANJA, REP_VERDE, REP_AMARILLO, REP_MAGENTA];

export function fmtGs(v: any): string {
  return Number(v || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
}
export function fmtNum(v: any): string {
  return Number(v || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
}
export function fmtDec(v: any): string {
  return Number(v || 0).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Tarjeta de KPI con variación (delta) lista para el template. */
export interface KpiCard {
  label: string;
  valor: string;
  tieneDelta: boolean;
  dir: 'up' | 'down';
  buena: boolean;
  deltaTexto: string;
}

/** Arma un KPI. `invertido` = subir es malo (egresos, gastos, deudas). */
export function buildKpiCard(label: string, valor: string, variacion: number | null, opts?: { invertido?: boolean }): KpiCard {
  if (variacion == null) {
    return { label, valor, tieneDelta: false, dir: 'up', buena: true, deltaTexto: '' };
  }
  const sube = variacion >= 0;
  const invertido = opts?.invertido === true;
  return {
    label, valor, tieneDelta: true,
    dir: sube ? 'up' : 'down',
    buena: invertido ? !sube : sube,
    deltaTexto: `${sube ? '+' : ''}${fmtDec(variacion)}%`,
  };
}

/** KPI cuyo valor ya es un porcentaje y la variación va en puntos. */
export function buildKpiCardPct(label: string, valorPct: number, variacionPts: number | null): KpiCard {
  const valor = `${fmtDec(valorPct)}%`;
  if (variacionPts == null) {
    return { label, valor, tieneDelta: false, dir: 'up', buena: true, deltaTexto: '' };
  }
  const sube = variacionPts >= 0;
  return {
    label, valor, tieneDelta: true,
    dir: sube ? 'up' : 'down', buena: sube,
    deltaTexto: `${sube ? '+' : ''}${fmtDec(variacionPts)} pts`,
  };
}

/** Opciones base para gráficos compactos en mobile (leyenda arriba, sin ejes cargados). */
export function chartOptions(tipo: 'line' | 'bar' | 'doughnut'): ChartConfiguration<any>['options'] {
  const grid = 'rgba(128,128,128,0.14)';
  const tick = '#9aa0a6';
  const base: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      // La dona usa leyenda propia en el template; línea y barras la muestran
      // (línea: Actual/Anterior; barras: Ingresos/Egresos).
      legend: { display: tipo !== 'doughnut', position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, color: tick } },
      tooltip: { enabled: true },
    },
  };
  if (tipo === 'doughnut') {
    base.cutout = '60%';
    base.plugins.legend.display = false;
    return base;
  }
  base.scales = {
    x: { grid: { display: false }, ticks: { color: tick, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
    y: { grid: { color: grid }, ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 5 }, beginAtZero: true },
  };
  return base;
}

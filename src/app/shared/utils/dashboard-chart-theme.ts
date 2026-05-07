import { ChartConfiguration, ChartType } from 'chart.js';

/**
 * Lee una variable CSS del root, retornando un fallback si no existe.
 */
function readCssVar(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Configuracion comun de Chart.js para todos los dashboards.
 * Lee colores de las CSS vars (`--text-primary`, `--text-secondary`) para
 * respetar light/dark theme automaticamente.
 *
 * @param type tipo de grafico (line, bar, doughnut, etc.)
 */
export function getDashboardChartOptions<T extends ChartType = 'line'>(
  type: T = 'line' as T
): ChartConfiguration<T>['options'] {
  const textPrimary = readCssVar('--text-primary', '#e0e0e0');
  const textSecondary = readCssVar('--text-secondary', '#888888');
  const isDark = textPrimary.toLowerCase() === '#ffffff' || textPrimary.toLowerCase() === '#fff';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tooltipBg = isDark ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)';
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

  const baseOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: {
        display: true,
        labels: {
          color: textSecondary,
          font: { size: 12 },
          usePointStyle: true,
          padding: 12,
        },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: textPrimary,
        bodyColor: textSecondary,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
      },
    },
  };

  if (type !== 'doughnut' && type !== 'pie' && type !== 'radar' && type !== 'polarArea') {
    baseOptions.scales = {
      x: {
        grid: { color: gridColor },
        ticks: { color: textSecondary, font: { size: 11 } },
      },
      y: {
        grid: { color: gridColor },
        ticks: {
          color: textSecondary,
          font: { size: 11 },
          callback: (value: any) => {
            if (typeof value !== 'number') return value;
            if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
            if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(0) + 'K';
            return value;
          },
        },
      },
    };
  }

  return baseOptions;
}

/**
 * Paleta consistente para charts.
 */
export const DASHBOARD_CHART_COLORS = {
  primary: '#7c4dff',
  primarySoft: 'rgba(124, 77, 255, 0.08)',
  cyan: '#00e5ff',
  cyanSoft: 'rgba(0, 229, 255, 0.05)',
  success: '#4caf50',
  successSoft: 'rgba(76, 175, 80, 0.1)',
  warning: '#ff9800',
  warningSoft: 'rgba(255, 152, 0, 0.1)',
  error: '#f44336',
  errorSoft: 'rgba(244, 67, 54, 0.1)',
  info: '#2196f3',
  infoSoft: 'rgba(33, 150, 243, 0.1)',
};

/**
 * Helper para generar dataset de linea con estilo dashboard.
 */
export function buildLineDataset(
  label: string,
  data: number[],
  color: string,
  softColor: string,
  fill = true
): any {
  return {
    data,
    label,
    borderColor: color,
    backgroundColor: softColor,
    pointBackgroundColor: color,
    pointBorderColor: color,
    pointRadius: 3,
    pointHoverRadius: 5,
    borderWidth: 2.2,
    fill,
    tension: 0.35,
  };
}

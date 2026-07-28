/** Parámetros del período de un reporte de cierre de mes (mobile). Espeja el
 * contrato del backend `ReportePeriodoParams`. */
export interface ReportePeriodoParams {
  rango: 'today' | 'week' | 'month' | 'prevMonth' | 'quarter' | 'custom';
  desde?: string;
  hasta?: string;
  comparar?: boolean;
  monedaId?: number;
}

export interface RangoPreset {
  value: ReportePeriodoParams['rango'];
  label: string;
}

export const RANGO_PRESETS: RangoPreset[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'prevMonth', label: 'Mes ant.' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'custom', label: 'Personalizado' },
];

/**
 * Modelos compartidos del hub de Reportes (cierre de mes).
 */

/** Parámetros del período que emite el control y consume el backend. */
export interface ReportePeriodoParams {
  rango: string;          // 'today' | 'week' | 'month' | 'prevMonth' | 'quarter' | 'custom'
  desde?: string;         // ISO, solo en 'custom'
  hasta?: string;         // ISO, solo en 'custom'
  comparar: boolean;      // comparar contra el período anterior (deltas)
  monedaId?: number;      // moneda de presentación (por defecto la principal)
}

export const RANGO_PRESETS: Array<{ value: string; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'prevMonth', label: 'Mes anterior' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'custom', label: 'Personalizado' },
];

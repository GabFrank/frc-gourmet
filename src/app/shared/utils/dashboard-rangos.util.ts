/**
 * Rangos de tiempo compartidos por los dashboards.
 *
 * Antes cada dashboard resolvía su propio período: Ventas tenía el tipo `Rango`
 * y los buckets del chart inline en su handler, mientras Compras / Productos /
 * Caja Mayor tenían el período hardcodeado (mes actual, 6 meses, 30 días). Esto
 * centraliza las dos preguntas que todos se hacen:
 *
 *   - `rangoToFechas(rango)`  → el intervalo [desde, hasta] para filtrar filas.
 *   - `bucketsForRango(rango)` → los tramos del eje X del chart, con su label.
 *
 * Lógica pura y determinística: `now` es un parámetro para poder testearlo.
 * No toca la BD ni el driver — el SQL sigue siendo responsabilidad de cada
 * handler (usar `dbQuery` para portabilidad SQLite/Postgres).
 */

export type Rango = 'today' | 'week' | 'month' | 'last-month' | '3months' | '6months';

export const RANGOS: Rango[] = ['today', 'week', 'month', 'last-month', '3months', '6months'];

/** Label en español de cada rango — fuente única para los chips de la UI. */
export const RANGO_LABEL: Record<Rango, string> = {
  'today': 'Hoy',
  'week': 'Esta semana',
  'month': 'Este mes',
  'last-month': 'Mes pasado',
  '3months': '3 meses',
  '6months': '6 meses',
};

export interface RangoBucket {
  desde: Date;
  hasta: Date;
  /** Texto del eje X: 'Lun', '14', 'S3', 'Ago', '08h'. */
  label: string;
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function inicioDelDia(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function finDelDia(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

/**
 * Resta `meses` meses sin desbordar de mes.
 *
 * `setMonth(getMonth() - 3)` sobre el 31 de mayo da el 3 de marzo (febrero no
 * tiene 31), corriendo el rango unos días. Acá el día se recorta al último del
 * mes destino: 31/05 − 3 meses = 28/02.
 */
function restarMeses(d: Date, meses: number): Date {
  const dia = d.getDate();
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() - meses);
  const ultimoDiaDelMes = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(dia, ultimoDiaDelMes));
  return r;
}

/**
 * Intervalo [desde, hasta] del rango, con bordes de día completo.
 *
 * `today` es el día de hoy; `week` los últimos 7 días (hoy incluido); `month`
 * los últimos 30; `last-month` el mes calendario anterior completo; `3months` /
 * `6months` van hacia atrás por mes calendario desde hoy.
 */
export function rangoToFechas(rango: Rango, now: Date = new Date()): { desde: Date; hasta: Date } {
  if (rango === 'last-month') {
    const desde = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const hasta = new Date(now.getFullYear(), now.getMonth(), 0);
    return { desde: inicioDelDia(desde), hasta: finDelDia(hasta) };
  }

  const hasta = finDelDia(now);
  let desde = inicioDelDia(now);
  switch (rango) {
    case 'today': break;
    case 'week': desde.setDate(desde.getDate() - 6); break;
    case 'month': desde.setDate(desde.getDate() - 29); break;
    case '3months': desde = inicioDelDia(restarMeses(desde, 3)); break;
    case '6months': desde = inicioDelDia(restarMeses(desde, 6)); break;
  }
  return { desde, hasta };
}

/**
 * Tramos del eje X, del más viejo al más nuevo. La granularidad la define el
 * rango: horaria para `today`, diaria hasta un mes, semanal para 3 meses y
 * mensual para 6.
 *
 * Cada bucket trae su intervalo cerrado, así el handler solo itera y agrega —
 * no vuelve a calcular fechas.
 */
export function bucketsForRango(rango: Rango, now: Date = new Date()): RangoBucket[] {
  const buckets: RangoBucket[] = [];

  if (rango === 'today') {
    // Una barra por hora del día de hoy, de 00h a la hora actual.
    const base = inicioDelDia(now);
    for (let h = 0; h <= now.getHours(); h++) {
      const desde = new Date(base); desde.setHours(h, 0, 0, 0);
      const hasta = new Date(base); hasta.setHours(h, 59, 59, 999);
      buckets.push({ desde, hasta, label: `${String(h).padStart(2, '0')}h` });
    }
    return buckets;
  }

  if (rango === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      buckets.push({ desde: inicioDelDia(d), hasta: finDelDia(d), label: DIAS[d.getDay()] });
    }
    return buckets;
  }

  if (rango === 'month') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      buckets.push({ desde: inicioDelDia(d), hasta: finDelDia(d), label: `${d.getDate()}` });
    }
    return buckets;
  }

  if (rango === 'last-month') {
    // Todos los días del mes calendario anterior.
    const primero = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const ultimoDia = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    for (let dia = 1; dia <= ultimoDia; dia++) {
      const d = new Date(primero.getFullYear(), primero.getMonth(), dia);
      buckets.push({ desde: inicioDelDia(d), hasta: finDelDia(d), label: `${dia}` });
    }
    return buckets;
  }

  if (rango === '3months') {
    // 12 semanas terminando hoy. El último bucket cierra hoy, no el domingo.
    for (let i = 11; i >= 0; i--) {
      const desde = new Date(now); desde.setDate(desde.getDate() - (i * 7) - 6);
      const hasta = new Date(now); hasta.setDate(hasta.getDate() - (i * 7));
      buckets.push({ desde: inicioDelDia(desde), hasta: finDelDia(hasta), label: `S${12 - i}` });
    }
    return buckets;
  }

  // 6months: 6 meses calendario terminando en el mes actual.
  for (let i = 5; i >= 0; i--) {
    const desde = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const hasta = new Date(desde.getFullYear(), desde.getMonth() + 1, 0);
    buckets.push({ desde: inicioDelDia(desde), hasta: finDelDia(hasta), label: MESES[desde.getMonth()] });
  }
  return buckets;
}

/** Chip de rango de la UI. `selected` lo mutan los componentes al hacer click. */
export interface RangoChip {
  label: string;
  value: Rango;
  selected: boolean;
}

/**
 * Construye los chips de rango de un dashboard.
 *
 * Cada dashboard elige QUÉ rangos ofrece y cuál viene marcado — Ventas arranca
 * en el día, Compras en el mes. El label sale de `RANGO_LABEL`, así que agregar
 * un rango no obliga a tocar los componentes.
 */
export function buildRangoChips(rangos: Rango[], seleccionado: Rango): RangoChip[] {
  return rangos.map(r => ({ label: RANGO_LABEL[r], value: r, selected: r === seleccionado }));
}

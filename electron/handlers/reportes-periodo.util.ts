/**
 * Resolución del período de un reporte de cierre de mes a partir de los presets
 * del control de período. Devuelve el rango ACTUAL y (si se pide comparar) el
 * ANTERIOR, para calcular deltas.
 *
 * Criterio de comparación:
 *  - `month` / `prevMonth`: mes calendario anterior, hasta el MISMO día del mes
 *    (mes-a-fecha comparable). Es lo que espera un cierre de mes ("vs Jun").
 *  - resto (`today`/`week`/`quarter`/`custom`): ventana de igual longitud
 *    inmediatamente anterior.
 */
export interface RangoFechas {
  desde: Date;
  hasta: Date;
}

export interface PeriodoResuelto {
  actual: RangoFechas;
  anterior: RangoFechas | null;
  /** Etiqueta legible del período actual (ej: "1 – 27 Jul 2026"). */
  label: string;
  /** Etiqueta legible del período de comparación (ej: "Jun 2026") o null. */
  labelAnterior: string | null;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDia(d: Date): string { return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; }

export function resolverPeriodo(
  params: { rango?: string; desde?: string; hasta?: string; comparar?: boolean },
  now: Date = new Date(),
): PeriodoResuelto {
  const rango = params?.rango || 'month';
  const comparar = params?.comparar === true;
  let desde: Date;
  let hasta: Date;
  let anterior: RangoFechas | null = null;
  let label = '';
  let labelAnterior: string | null = null;

  const y = now.getFullYear();
  const m = now.getMonth();

  if (rango === 'today') {
    desde = startOfDay(now); hasta = endOfDay(now);
    label = fmtDia(now);
  } else if (rango === 'week') {
    hasta = endOfDay(now); desde = startOfDay(addDays(now, -6));
    label = `${fmtDia(desde)} – ${fmtDia(hasta)}`;
  } else if (rango === 'quarter') {
    hasta = endOfDay(now); desde = startOfDay(addDays(now, -89));
    label = `${fmtDia(desde)} – ${fmtDia(hasta)}`;
  } else if (rango === 'prevMonth') {
    desde = new Date(y, m - 1, 1, 0, 0, 0, 0);
    hasta = new Date(y, m, 0, 23, 59, 59, 999); // último día del mes anterior
    label = `${MESES[desde.getMonth()]} ${desde.getFullYear()}`;
  } else if (rango === 'custom' && params.desde && params.hasta) {
    desde = startOfDay(new Date(params.desde));
    hasta = endOfDay(new Date(params.hasta));
    label = `${fmtDia(desde)} – ${fmtDia(hasta)}`;
  } else {
    // 'month' (default): mes actual a la fecha.
    desde = new Date(y, m, 1, 0, 0, 0, 0);
    const finMes = new Date(y, m + 1, 0, 23, 59, 59, 999);
    hasta = now < finMes ? endOfDay(now) : finMes;
    label = `${fmtDia(desde)} – ${fmtDia(hasta)}`;
  }

  if (comparar) {
    if (rango === 'month' || rango === 'prevMonth') {
      // Mes calendario anterior. Para `month` (mes-a-fecha) se recorta al mismo
      // día de corte; para `prevMonth` (mes completo) se toma el mes entero.
      const pDesde = new Date(desde.getFullYear(), desde.getMonth() - 1, 1, 0, 0, 0, 0);
      const diasEnMesAnterior = new Date(desde.getFullYear(), desde.getMonth(), 0).getDate();
      const diaCorte = rango === 'prevMonth' ? diasEnMesAnterior : hasta.getDate();
      const pHasta = new Date(pDesde.getFullYear(), pDesde.getMonth(), Math.min(diaCorte, diasEnMesAnterior), 23, 59, 59, 999);
      anterior = { desde: pDesde, hasta: pHasta };
      labelAnterior = `${MESES[pDesde.getMonth()]} ${pDesde.getFullYear()}`;
    } else {
      // Ventana de igual longitud inmediatamente anterior.
      const ms = hasta.getTime() - desde.getTime();
      const pHasta = new Date(desde.getTime() - 1);
      const pDesde = new Date(pHasta.getTime() - ms);
      anterior = { desde: pDesde, hasta: pHasta };
      labelAnterior = `${fmtDia(pDesde)} – ${fmtDia(pHasta)}`;
    }
  }

  return { actual: { desde, hasta }, anterior, label, labelAnterior };
}

/** Variación porcentual entre dos valores; null si el base es 0 (sin comparación válida). */
export function variacionPct(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return +(((actual - anterior) / Math.abs(anterior)) * 100).toFixed(1);
}

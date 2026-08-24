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


import {
  anclaJornada,
  finDelDia,
  inicioDelDia,
  parseFechaLocal,
} from '../utils/dashboard-rangos.util';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * JORNADA COMERCIAL — literalmente las mismas funciones que usan los dashboards.
 *
 * Este archivo tenia su PROPIA aritmetica de dias. Con la jornada encendida y
 * esta sin enterarse, una venta de la 01:30 aparecia en dias distintos segun la
 * pantalla: los dashboards la contaban en la jornada de ayer y Reportes en el
 * dia calendario de hoy.
 *
 * Se importan en vez de reimplementarse a proposito. Mientras fueron dos copias
 * "equivalentes", un ajuste a una no llegaba a la otra — que es exactamente como
 * nacio el desfase que se acaba de corregir. Con un solo origen, no puede volver
 * a pasar.
 */
const startOfDay = inicioDelDia;
const endOfDay = finDelDia;
const anclaDia = anclaJornada;

function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDia(d: Date): string { return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; }

export function resolverPeriodo(
  params: { rango?: string; desde?: string; hasta?: string; comparar?: boolean },
  now: Date = new Date(),
  inicioJornada = 0,
): PeriodoResuelto {
  const rango = params?.rango || 'month';
  // Toda la aritmetica se ancla en la jornada en curso, no en el dia calendario.
  now = anclaDia(now, inicioJornada);
  const comparar = params?.comparar === true;
  let desde: Date;
  let hasta: Date;
  let anterior: RangoFechas | null = null;
  let label = '';
  let labelAnterior: string | null = null;

  const y = now.getFullYear();
  const m = now.getMonth();

  if (rango === 'today') {
    desde = startOfDay(now, inicioJornada); hasta = endOfDay(now, inicioJornada);
    label = fmtDia(now);
  } else if (rango === 'week') {
    hasta = endOfDay(now, inicioJornada); desde = startOfDay(addDays(now, -6), inicioJornada);
    label = `${fmtDia(desde)} – ${fmtDia(hasta)}`;
  } else if (rango === 'quarter') {
    hasta = endOfDay(now, inicioJornada); desde = startOfDay(addDays(now, -89), inicioJornada);
    label = `${fmtDia(desde)} – ${fmtDia(hasta)}`;
  } else if (rango === 'prevMonth') {
    desde = startOfDay(new Date(y, m - 1, 1), inicioJornada);
    hasta = endOfDay(new Date(y, m, 0), inicioJornada); // último día del mes anterior
    label = `${MESES[desde.getMonth()]} ${desde.getFullYear()}`;
  } else if (rango === 'custom' && params.desde && params.hasta) {
    desde = startOfDay(parseFechaLocal(params.desde), inicioJornada);
    hasta = endOfDay(parseFechaLocal(params.hasta), inicioJornada);
    label = `${fmtDia(desde)} – ${fmtDia(hasta)}`;
  } else {
    // 'month' (default): mes actual a la fecha.
    desde = startOfDay(new Date(y, m, 1), inicioJornada);
    const finMes = new Date(y, m + 1, 0, 23, 59, 59, 999);
    hasta = now < finMes ? endOfDay(now, inicioJornada) : finMes;
    label = `${fmtDia(desde)} – ${fmtDia(hasta)}`;
  }

  if (comparar) {
    if (rango === 'month' || rango === 'prevMonth') {
      // Mes calendario anterior. Para `month` (mes-a-fecha) se recorta al mismo
      // día de corte; para `prevMonth` (mes completo) se toma el mes entero.
      //
      // Dos cosas que se hacian mal y hay que sostener juntas:
      //
      // 1. Los limites se armaban con medianoche fija (`0,0,0,0` / `23:59:59.999`)
      //    mientras la ventana ACTUAL ya usaba `startOfDay`/`endOfDay` con la
      //    jornada. Con corte a las 07:00 la comparacion salia 24 h mas larga
      //    que el periodo actual: ventanas no comparables, y el % de variacion
      //    sesgado. Es el default de la pantalla (`comparar = true`, rango
      //    `month`), asi que se veia siempre.
      // 2. El dia de corte salia de `hasta.getDate()`, pero con la jornada
      //    encendida `hasta` ya rodo al dia calendario SIGUIENTE (la jornada del
      //    19 termina el 20 a las 06:59). Habia que leerlo del ancla de negocio,
      //    no del limite.
      const anclaActual = anclaDia(now, inicioJornada);
      const primeroMesAnterior = new Date(desde.getFullYear(), desde.getMonth() - 1, 1);
      const pDesde = startOfDay(primeroMesAnterior, inicioJornada);
      const diasEnMesAnterior = new Date(desde.getFullYear(), desde.getMonth(), 0).getDate();
      const diaCorte = rango === 'prevMonth' ? diasEnMesAnterior : anclaActual.getDate();
      const ultimoDia = new Date(
        primeroMesAnterior.getFullYear(),
        primeroMesAnterior.getMonth(),
        Math.min(diaCorte, diasEnMesAnterior),
      );
      const pHasta = endOfDay(ultimoDia, inicioJornada);
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

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

/**
 * JORNADA COMERCIAL — cuándo empieza "un día" para el negocio.
 *
 * Los turnos noche cruzan las 00:00 y llegan hasta las 02:00, así que el día
 * calendario parte las ventas de un mismo turno en dos. `inicioJornada` corre el
 * corte: con 7, la jornada del día D va de `D 07:00:00.000` a
 * `D+1 06:59:59.999`.
 *
 * `inicioJornada = 0` reproduce EXACTAMENTE el día calendario — es el default de
 * estas funciones para que ningún llamador que no la pase cambie de
 * comportamiento, y la vía de escape si algo sale mal en producción.
 *
 * ⚠️ Toda la aritmética es de CALENDARIO (`setHours`/`setDate`), nunca sumando
 * milisegundos. Sumar `H * 3600000` rompe en días de transición de horario de
 * verano: `setHours(7)` devuelve las 07:00 locales sea cual sea el offset UTC de
 * ese día, un `+7h` en milisegundos no.
 */

/**
 * La fecha calendario cuya jornada está en curso en `now`.
 *
 * Si el reloj está ANTES del corte, la jornada viva arrancó AYER. A las 03:00
 * con corte a las 07:00, "hoy" es la jornada del día anterior — y sin esto,
 * los buckets de `today` iterarían `7..3` (o sea, ninguno) con veinte horas de
 * ventas reales adentro.
 */
export function anclaJornada(now: Date, inicioJornada = 0): Date {
  const r = new Date(now);
  if (r.getHours() < inicioJornada) r.setDate(r.getDate() - 1);
  return r;
}

/** Instante en que arranca la jornada de la fecha `d`. */
function inicioDelDia(d: Date, inicioJornada = 0): Date {
  const r = new Date(d);
  r.setHours(inicioJornada, 0, 0, 0);
  return r;
}

/** Último instante de la jornada de `d`: el arranque de la siguiente, menos 1ms. */
function finDelDia(d: Date, inicioJornada = 0): Date {
  const r = inicioDelDia(d, inicioJornada);
  r.setDate(r.getDate() + 1);
  r.setMilliseconds(r.getMilliseconds() - 1);
  return r;
}

/**
 * Intervalo [desde, hasta] del rango: exactamente la union de sus buckets.
 *
 * Se deriva de `bucketsForRango` a proposito, y no con su propia aritmetica de
 * fechas. Las dos funciones alimentan cosas que el usuario ve juntas — la card
 * con el total del periodo y el chart que lo desglosa — asi que si cada una
 * calcula su ventana por separado terminan discrepando: con reglas propias,
 * "3 meses" daba 92 dias en la card contra 84 en el chart (12 semanas), y
 * "6 meses" arrancaba a mitad de enero en la card pero el 1 de febrero en el
 * chart. La suma de las barras no cerraba con el total. Derivandolo, cierran
 * por construccion.
 *
 * `today` es el dia de hoy hasta la hora actual; `week` los ultimos 7 dias
 * (hoy incluido); `month` los ultimos 30; `last-month` el mes calendario
 * anterior completo; `3months` las ultimas 12 semanas; `6months` los ultimos
 * 6 meses calendario (el actual incluido, hasta fin de mes).
 */
export function rangoToFechas(
  rango: Rango,
  now: Date = new Date(),
  inicioJornada = 0,
): { desde: Date; hasta: Date } {
  const buckets = bucketsForRango(rango, now, inicioJornada);
  return {
    desde: buckets[0].desde,
    hasta: buckets[buckets.length - 1].hasta,
  };
}

/**
 * Tramos del eje X, del más viejo al más nuevo. La granularidad la define el
 * rango: horaria para `today`, diaria hasta un mes, semanal para 3 meses y
 * mensual para 6.
 *
 * Cada bucket trae su intervalo cerrado, así el handler solo itera y agrega —
 * no vuelve a calcular fechas.
 */
export function bucketsForRango(
  rango: Rango,
  now: Date = new Date(),
  inicioJornada = 0,
): RangoBucket[] {
  const buckets: RangoBucket[] = [];
  // TODA la aritmética se ancla en la jornada en curso, no en el día calendario:
  // antes del corte, la jornada viva es la de ayer.
  const ancla = anclaJornada(now, inicioJornada);

  if (rango === 'today') {
    // Una barra por hora de la JORNADA en curso, desde el corte hasta ahora.
    //
    // Con corte a las 07:00 los tramos cruzan la medianoche real: 07h..23h caen
    // en una fecha calendario y 00h..06h en la siguiente. Por eso se avanza hora
    // a hora desde el arranque en vez de iterar `0..now.getHours()`, que con
    // corte 7 y reloj a las 03:00 daría un rango vacío.
    const arranque = inicioDelDia(ancla, inicioJornada);
    for (let k = 0; k < 24; k++) {
      const desde = new Date(arranque);
      desde.setHours(desde.getHours() + k);
      if (desde > now) break;
      const hasta = new Date(desde);
      hasta.setHours(hasta.getHours() + 1);
      hasta.setMilliseconds(hasta.getMilliseconds() - 1);
      buckets.push({ desde, hasta, label: `${String(desde.getHours()).padStart(2, '0')}h` });
    }
    return buckets;
  }

  if (rango === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(ancla); d.setDate(d.getDate() - i);
      buckets.push({ desde: inicioDelDia(d, inicioJornada), hasta: finDelDia(d, inicioJornada), label: DIAS[d.getDay()] });
    }
    return buckets;
  }

  if (rango === 'month') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(ancla); d.setDate(d.getDate() - i);
      buckets.push({ desde: inicioDelDia(d, inicioJornada), hasta: finDelDia(d, inicioJornada), label: `${d.getDate()}` });
    }
    return buckets;
  }

  if (rango === 'last-month') {
    // Todos los días del mes calendario anterior.
    const primero = new Date(ancla.getFullYear(), ancla.getMonth() - 1, 1);
    const ultimoDia = new Date(ancla.getFullYear(), ancla.getMonth(), 0).getDate();
    for (let dia = 1; dia <= ultimoDia; dia++) {
      const d = new Date(primero.getFullYear(), primero.getMonth(), dia);
      buckets.push({ desde: inicioDelDia(d, inicioJornada), hasta: finDelDia(d, inicioJornada), label: `${dia}` });
    }
    return buckets;
  }

  if (rango === '3months') {
    // 12 semanas terminando hoy. El último bucket cierra hoy, no el domingo.
    for (let i = 11; i >= 0; i--) {
      const desde = new Date(ancla); desde.setDate(desde.getDate() - (i * 7) - 6);
      const hasta = new Date(ancla); hasta.setDate(hasta.getDate() - (i * 7));
      buckets.push({ desde: inicioDelDia(desde, inicioJornada), hasta: finDelDia(hasta, inicioJornada), label: `S${12 - i}` });
    }
    return buckets;
  }

  // 6months: 6 meses calendario terminando en el mes actual.
  for (let i = 5; i >= 0; i--) {
    const desde = new Date(ancla.getFullYear(), ancla.getMonth() - i, 1);
    const hasta = new Date(desde.getFullYear(), desde.getMonth() + 1, 0);
    buckets.push({ desde: inicioDelDia(desde, inicioJornada), hasta: finDelDia(hasta, inicioJornada), label: MESES[desde.getMonth()] });
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

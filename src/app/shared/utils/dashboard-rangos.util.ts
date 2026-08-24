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
 * Ventana [desde, hasta] a partir de las fechas que eligió el usuario.
 *
 * Acepta `YYYY-MM-DD` (lo que manda un `<input type="date">`) y lo interpreta
 * como fecha LOCAL. `new Date('2026-07-15')` es UTC-medianoche: en Paraguay
 * (UTC-3/-4) eso cae el 14 a la noche, así que el rango entero corría un día
 * hacia atrás. El mismo bug existía en los reportes de cierre de mes.
 *
 * Los extremos se expanden a la JORNADA completa: elegir "15/07" trae desde las
 * 07:00 del 15 hasta las 06:59 del 16 — el turno noche del 15 entero, que es lo
 * que el usuario quiere decir cuando pide "el 15".
 *
 * Un extremo ausente lo cubre `fallback` (normalmente el rango del preset).
 */
export function ventanaDeFechas(
  desdeStr: string | undefined,
  hastaStr: string | undefined,
  fallback: { desde: Date; hasta: Date },
  inicioJornada = 0,
): { desde: Date; hasta: Date } {
  const hasta = hastaStr ? finDelDia(parseFechaLocal(hastaStr), inicioJornada) : fallback.hasta;
  let desde = desdeStr ? inicioDelDia(parseFechaLocal(desdeStr), inicioJornada) : fallback.desde;

  // Con SÓLO "hasta", el fallback de `desde` es el preset — que arranca HOY.
  // Pedir "hasta el 1/8" daba `24/8 07:00 .. 2/8 06:59`: un rango invertido,
  // SQL siempre falso, y la UI mostrando "No hubo ventas en el período" cuando
  // sí las había. El caso simétrico (sólo "desde") no tiene el problema porque
  // su techo es "ahora".
  //
  // Piso defensivo: si el fallback quedaría DESPUÉS de `hasta`, la ventana se
  // acota a la jornada de `hasta`. Nunca devuelve un rango invertido, que es lo
  // que producía el resultado vacío silencioso.
  //
  // La ambigüedad de fondo ("¿hasta el 1/8 desde cuándo?") se resuelve en la UI,
  // que pide los dos extremos; esto es la red por si otro caller manda uno solo.
  if (!desdeStr && desde > hasta) {
    // Se ancla en la FECHA que eligió el usuario, no en `hasta`: éste ya es el
    // cierre de la jornada (06:59), y `inicioDelDia` sobre él caería en la
    // jornada siguiente, dejando el rango invertido por 1 ms.
    desde = inicioDelDia(parseFechaLocal(hastaStr as string), inicioJornada);
  }
  return { desde, hasta };
}

/**
 * Parsea la fecha del usuario como local. Un ISO con hora explícita se deja al
 * parser nativo: ahí el offset ya viene dicho y no hay ambigüedad que resolver.
 */
export function parseFechaLocal(v: string | Date): Date {
  if (v instanceof Date) return new Date(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return new Date(v);
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

/**
 * Tramos del chart para una ventana ARBITRARIA (las fechas que eligió el usuario).
 *
 * `bucketsForRango` sólo sabe de presets. Con fechas explícitas el chart se
 * construía igual sobre el preset (`'week'` por default) mientras las cards
 * usaban la ventana pedida: el usuario filtraba julio y veía las cards de julio
 * con un chart de la semana actual, en cero. Es exactamente el desfase
 * card/chart que el invariante de `rangoToFechas` existe para evitar.
 *
 * La granularidad sale de la duración, con el mismo criterio que los presets:
 * horaria hasta 1 día, diaria hasta 45, semanal hasta 180, mensual más allá.
 * Los tramos cubren [desde, hasta] por construcción, así que la suma de las
 * barras cierra con el total de la card.
 */
export function bucketsForVentana(
  desde: Date,
  hasta: Date,
  inicioJornada = 0,
): RangoBucket[] {
  const buckets: RangoBucket[] = [];
  const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86_400_000));

  if (dias <= 1) {
    // Una barra por hora. Igual que `today`, puede cruzar la medianoche.
    const cursor = new Date(desde);
    while (cursor <= hasta) {
      const fin = new Date(cursor);
      fin.setHours(fin.getHours() + 1);
      fin.setMilliseconds(fin.getMilliseconds() - 1);
      buckets.push({
        desde: new Date(cursor),
        hasta: fin > hasta ? new Date(hasta) : fin,
        label: `${String(cursor.getHours()).padStart(2, '0')}h`,
      });
      cursor.setHours(cursor.getHours() + 1);
    }
    return buckets;
  }

  if (dias <= 45) {
    const d = new Date(desde);
    while (d <= hasta) {
      const fin = finDelDia(d, inicioJornada);
      buckets.push({
        desde: inicioDelDia(d, inicioJornada),
        hasta: fin > hasta ? new Date(hasta) : fin,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
      });
      d.setDate(d.getDate() + 1);
    }
    return buckets;
  }

  if (dias <= 180) {
    const d = new Date(desde);
    let n = 1;
    while (d <= hasta) {
      const finSemana = new Date(d);
      finSemana.setDate(finSemana.getDate() + 6);
      const fin = finDelDia(finSemana, inicioJornada);
      buckets.push({
        desde: inicioDelDia(d, inicioJornada),
        hasta: fin > hasta ? new Date(hasta) : fin,
        label: `S${n++}`,
      });
      d.setDate(d.getDate() + 7);
    }
    return buckets;
  }

  // Un tramo por mes calendario.
  const d = new Date(desde.getFullYear(), desde.getMonth(), 1);
  while (d <= hasta) {
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const arranque = inicioDelDia(d, inicioJornada);
    const fin = finDelDia(ultimo, inicioJornada);
    buckets.push({
      desde: arranque < desde ? new Date(desde) : arranque,
      hasta: fin > hasta ? new Date(hasta) : fin,
      label: MESES[d.getMonth()],
    });
    d.setMonth(d.getMonth() + 1);
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

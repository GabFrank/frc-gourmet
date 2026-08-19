"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRangoChips = exports.bucketsForRango = exports.rangoToFechas = exports.RANGO_LABEL = exports.RANGOS = void 0;
exports.RANGOS = ['today', 'week', 'month', 'last-month', '3months', '6months'];
/** Label en español de cada rango — fuente única para los chips de la UI. */
exports.RANGO_LABEL = {
    'today': 'Hoy',
    'week': 'Esta semana',
    'month': 'Este mes',
    'last-month': 'Mes pasado',
    '3months': '3 meses',
    '6months': '6 meses',
};
const DIAS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function inicioDelDia(d) {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
}
function finDelDia(d) {
    const r = new Date(d);
    r.setHours(23, 59, 59, 999);
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
function rangoToFechas(rango, now = new Date()) {
    const buckets = bucketsForRango(rango, now);
    return {
        desde: buckets[0].desde,
        hasta: buckets[buckets.length - 1].hasta,
    };
}
exports.rangoToFechas = rangoToFechas;
/**
 * Tramos del eje X, del más viejo al más nuevo. La granularidad la define el
 * rango: horaria para `today`, diaria hasta un mes, semanal para 3 meses y
 * mensual para 6.
 *
 * Cada bucket trae su intervalo cerrado, así el handler solo itera y agrega —
 * no vuelve a calcular fechas.
 */
function bucketsForRango(rango, now = new Date()) {
    const buckets = [];
    if (rango === 'today') {
        // Una barra por hora del día de hoy, de 00h a la hora actual.
        const base = inicioDelDia(now);
        for (let h = 0; h <= now.getHours(); h++) {
            const desde = new Date(base);
            desde.setHours(h, 0, 0, 0);
            const hasta = new Date(base);
            hasta.setHours(h, 59, 59, 999);
            buckets.push({ desde, hasta, label: `${String(h).padStart(2, '0')}h` });
        }
        return buckets;
    }
    if (rango === 'week') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            buckets.push({ desde: inicioDelDia(d), hasta: finDelDia(d), label: DIAS[d.getDay()] });
        }
        return buckets;
    }
    if (rango === 'month') {
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
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
            const desde = new Date(now);
            desde.setDate(desde.getDate() - (i * 7) - 6);
            const hasta = new Date(now);
            hasta.setDate(hasta.getDate() - (i * 7));
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
exports.bucketsForRango = bucketsForRango;
/**
 * Construye los chips de rango de un dashboard.
 *
 * Cada dashboard elige QUÉ rangos ofrece y cuál viene marcado — Ventas arranca
 * en el día, Compras en el mes. El label sale de `RANGO_LABEL`, así que agregar
 * un rango no obliga a tocar los componentes.
 */
function buildRangoChips(rangos, seleccionado) {
    return rangos.map(r => ({ label: exports.RANGO_LABEL[r], value: r, selected: r === seleccionado }));
}
exports.buildRangoChips = buildRangoChips;
//# sourceMappingURL=dashboard-rangos.util.js.map
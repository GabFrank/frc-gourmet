"use strict";
/**
 * Conversión de montos a letras (español rioplatense/paraguayo).
 *
 * **Single source of truth** para esta función. Lo usan:
 * - El pipe Angular `<monto-en-letras>` (`src/app/shared/pipes/monto-en-letras.pipe.ts`).
 * - Los handlers de PDF/ticket en backend (`electron/utils/pdf.utils.ts` y
 *   `electron/utils/monto-letras.utils.ts`, que es un re-export de este archivo).
 *
 * Usado en pagarés, recibos, comprobantes legales y liquidaciones.
 *
 * **Decisión de no usar `numero-a-letras` npm:** las libs disponibles tienen
 * problemas de bundling en Electron CommonJS y/o no soportan PYG sin decimales
 * con sufijo "GUARANIES". Implementación propia, ~120 LOC, testeada con los
 * casos críticos del dominio.
 *
 * Output siempre en UPPERCASE para consistencia con la convención del proyecto.
 *
 * Ejemplos:
 *   montoEnLetras(1500000, 'PYG')   → 'UN MILLÓN QUINIENTOS MIL GUARANIES'
 *   montoEnLetras(2500.50, 'USD')   → 'DOS MIL QUINIENTOS CON 50/100 DÓLARES ESTADOUNIDENSES'
 *   montoEnLetras(0, 'PYG')         → 'CERO GUARANIES'
 *   montoEnLetras(1, 'PYG')         → 'UN GUARANÍ'
 *   montoEnLetras(21, 'PYG')        → 'VEINTIÚN GUARANIES'
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.montoEnLetrasConPrefijo = exports.montoEnLetras = exports.enteroEnLetras = void 0;
const MONEDAS = {
    PYG: { singular: 'GUARANÍ', plural: 'GUARANIES', decimales: 0 },
    USD: { singular: 'DÓLAR ESTADOUNIDENSE', plural: 'DÓLARES ESTADOUNIDENSES', fraccionSingular: 'CENTAVO', fraccionPlural: 'CENTAVOS', decimales: 2 },
    BRL: { singular: 'REAL', plural: 'REALES', fraccionSingular: 'CENTAVO', fraccionPlural: 'CENTAVOS', decimales: 2 },
};
const UNIDADES = ['CERO', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES_10_19 = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const VEINTIN = ['VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
function tresCifras(n) {
    if (n === 0)
        return '';
    if (n === 100)
        return 'CIEN';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    let out = '';
    if (c > 0)
        out = CENTENAS[c];
    if (resto === 0)
        return out;
    const decenas = dosCifras(resto);
    return out ? `${out} ${decenas}` : decenas;
}
function dosCifras(n) {
    if (n < 10)
        return UNIDADES[n];
    if (n < 20)
        return ESPECIALES_10_19[n - 10];
    if (n < 30)
        return VEINTIN[n - 20];
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0)
        return DECENAS[d];
    return `${DECENAS[d]} Y ${UNIDADES[u]}`;
}
/** Convierte un entero >= 0 a letras (sin nombre de moneda). */
function enteroEnLetras(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0)
        return 'CERO';
    if (n < 1000)
        return tresCifras(n);
    if (n < 1000000) {
        const miles = Math.floor(n / 1000);
        const resto = n % 1000;
        const milesTexto = miles === 1 ? 'MIL' : `${tresCifras(miles)} MIL`;
        return resto === 0 ? milesTexto : `${milesTexto} ${tresCifras(resto)}`;
    }
    if (n < 1000000000000) {
        // "millones" admite contadores de 1 a 999.999 — el "mil millones" emerge
        // del enteroEnLetras recursivo del contador.
        const millones = Math.floor(n / 1000000);
        const resto = n % 1000000;
        const millonesTexto = millones === 1 ? 'UN MILLÓN' : `${enteroEnLetras(millones)} MILLONES`;
        return resto === 0 ? millonesTexto : `${millonesTexto} ${enteroEnLetras(resto)}`;
    }
    // Billones (10^12, escala larga). Improbable en montos del sistema pero por completitud.
    const billones = Math.floor(n / 1000000000000);
    const restoBill = n % 1000000000000;
    const head = billones === 1 ? 'UN BILLÓN' : `${enteroEnLetras(billones)} BILLONES`;
    return restoBill === 0 ? head : `${head} ${enteroEnLetras(restoBill)}`;
}
exports.enteroEnLetras = enteroEnLetras;
/** Apocopa UNO→UN, VEINTIUNO→VEINTIÚN al final del texto. */
function apocoparUno(texto) {
    return texto
        .replace(/\bVEINTIUNO\b/g, 'VEINTIÚN')
        .replace(/\bUNO\b$/g, 'UN');
}
/**
 * Convierte un monto a su representación en letras, con nombre de moneda.
 *
 * - PYG: parte entera apocopada + "GUARANIES"/"GUARANÍ" (sin decimales).
 * - USD/BRL: parte entera + "CON XX/100" + nombre moneda.
 */
function montoEnLetras(monto, moneda = 'PYG') {
    const code = (moneda || 'PYG').toUpperCase();
    const def = MONEDAS[code];
    if (!def)
        throw new Error(`Moneda no soportada: ${moneda}`);
    const valor = Math.abs(Number(monto) || 0);
    const entero = Math.floor(valor);
    const fraccion = def.decimales > 0
        ? Math.round((valor - entero) * Math.pow(10, def.decimales))
        : 0;
    const nombreMoneda = entero === 1 ? def.singular : def.plural;
    if (def.decimales > 0) {
        const ff = String(fraccion).padStart(def.decimales, '0');
        return `${enteroEnLetras(entero)} CON ${ff}/${'1' + '0'.repeat(def.decimales)} ${nombreMoneda}`;
    }
    return `${apocoparUno(enteroEnLetras(entero))} ${nombreMoneda}`;
}
exports.montoEnLetras = montoEnLetras;
/** Variante con prefijo "SON:" típica de pagarés. */
function montoEnLetrasConPrefijo(monto, moneda = 'PYG') {
    return `SON: ${montoEnLetras(monto, moneda)}`;
}
exports.montoEnLetrasConPrefijo = montoEnLetrasConPrefijo;
//# sourceMappingURL=monto-letras.util.js.map
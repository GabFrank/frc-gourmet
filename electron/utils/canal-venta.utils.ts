/**
 * Re-export de `src/app/shared/utils/canal-venta.util.ts` (single source of
 * truth del canal de venta) **más** el fragmento SQL equivalente, que sólo
 * tiene sentido en el backend.
 *
 * Si cambiás la clasificación, tocá los dos: el `CASE` de acá y
 * `clasificarCanalVenta()` en el módulo shared tienen que decir lo mismo. El
 * test `npm run test:canal-venta` los compara caso por caso justamente para que
 * no se separen — es el mismo riesgo que ya se documentó con
 * `CONCEPTO_ES_INGRESO` / `esIngreso()` en el pago consolidado.
 */
export {
  CanalVenta,
  CANAL_VENTA_ORDEN,
  CANAL_VENTA_LABEL,
  CANAL_VENTA_ICONO,
  ORIGEN_VENTA_LABEL,
  clasificarCanalVenta,
  canalDeVenta,
  esCanalDeReparto,
} from '../../src/app/shared/utils/canal-venta.util';
export type { DatosCanalVenta } from '../../src/app/shared/utils/canal-venta.util';

/**
 * JOIN que necesita `canalVentaExpr()`. Va como LEFT: la enorme mayoría de las
 * ventas no tiene delivery y un INNER las borraría del informe.
 */
export function joinDeliveryCanal(aliasVenta = 'v', aliasDelivery = 'dcanal'): string {
  return `LEFT JOIN deliveries ${aliasDelivery} ON ${aliasDelivery}.id = ${aliasVenta}.delivery_id`;
}

/**
 * Expresión SQL que devuelve el canal de la venta. Espejo exacto de
 * `clasificarCanalVenta()`, incluido el orden de las preguntas: el reparto gana
 * sobre la mesa.
 *
 * Portable entre SQLite y Postgres: `CASE WHEN` con comparación de texto, sin
 * funciones de dialecto.
 */
export function canalVentaExpr(aliasVenta = 'v', aliasDelivery = 'dcanal'): string {
  return `CASE
    WHEN ${aliasDelivery}.modo = 'RETIRO' THEN 'RETIRO'
    WHEN ${aliasVenta}.delivery_id IS NOT NULL THEN 'DELIVERY'
    WHEN ${aliasVenta}.mesa_id IS NOT NULL THEN 'SALON'
    ELSE 'MOSTRADOR'
  END`;
}

/**
 * Fragmento `WHERE` para acotar a un canal.
 *
 * **No requiere el join de `joinDeliveryCanal()`**: resuelve el modo con un
 * `EXISTS` correlacionado. Es a propósito — así se puede pegar a consultas que
 * ya existían y no tienen (ni quieren) un join más, como las series de
 * tendencia, que corren sobre el mismo `sumaVentasRango` que los KPIs y no
 * pueden cambiar de forma sin desalinearse de ellos.
 *
 * Devuelve SQL sin parámetros: los cuatro valores son constantes del enum, no
 * entrada del usuario, y meterlos como placeholder obligaría a cada caller a
 * hilvanar el orden de los params sólo para esto.
 *
 * Un canal desconocido devuelve una condición imposible en vez de abrir el
 * filtro: un typo que muestra el universo entero parece que funcionó. El caller
 * puede chequear antes con `esCanalValido`.
 */
export function condicionCanal(canal: string, aliasVenta = 'v'): string {
  const esRetiro = `EXISTS (SELECT 1 FROM deliveries dcond WHERE dcond.id = ${aliasVenta}.delivery_id AND dcond.modo = 'RETIRO')`;
  switch (String(canal || '').toUpperCase()) {
    case 'RETIRO':
      return esRetiro;
    case 'DELIVERY':
      return `(${aliasVenta}.delivery_id IS NOT NULL AND NOT ${esRetiro})`;
    case 'SALON':
      return `(${aliasVenta}.delivery_id IS NULL AND ${aliasVenta}.mesa_id IS NOT NULL)`;
    case 'MOSTRADOR':
      return `(${aliasVenta}.delivery_id IS NULL AND ${aliasVenta}.mesa_id IS NULL)`;
    default:
      return `1 = 0`;
  }
}

/** `true` si el string es uno de los cuatro canales conocidos. */
export function esCanalValido(canal: unknown): boolean {
  return ['SALON', 'MOSTRADOR', 'DELIVERY', 'RETIRO'].includes(String(canal || '').toUpperCase());
}

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
 * Fragmento `WHERE` para acotar a un canal. Devuelve SQL sin parámetros: los
 * cuatro valores son constantes del enum, no entrada del usuario, y meterlos
 * como placeholder obligaría a todos los callers a hilvanar el orden de los
 * params sólo para esto.
 *
 * El caller valida el canal contra el enum antes de llamar (ver
 * `esCanalValido`); un valor desconocido devuelve una condición imposible en
 * vez de abrir el filtro, para que un typo no muestre TODO en silencio.
 */
export function condicionCanal(canal: string, aliasVenta = 'v', aliasDelivery = 'dcanal'): string {
  switch (String(canal || '').toUpperCase()) {
    case 'RETIRO':
      return `${aliasDelivery}.modo = 'RETIRO'`;
    case 'DELIVERY':
      return `(${aliasVenta}.delivery_id IS NOT NULL AND (${aliasDelivery}.modo IS NULL OR ${aliasDelivery}.modo <> 'RETIRO'))`;
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

/**
 * Re-export de `src/app/shared/utils/dashboard-rangos.util.ts` — single source
 * of truth de los rangos de los dashboards. El módulo shared es TS puro sin
 * dependencias Electron/Angular, así que los handlers (backend) y los chips de
 * los componentes (frontend) usan exactamente el mismo tipo `Rango` y los
 * mismos labels: si se agrega un rango, aparece en los dos lados a la vez.
 *
 * Si querés cambiar la lógica, editá el archivo de `shared/utils`.
 */
export {
  RANGOS,
  RANGO_LABEL,
  rangoToFechas,
  bucketsForRango,
  bucketsForVentana,
  buildRangoChips,
  anclaJornada,
  inicioDelDia,
  finDelDia,
  ventanaDeFechas,
  parseFechaLocal,
} from '../../src/app/shared/utils/dashboard-rangos.util';
export type { Rango, RangoBucket, RangoChip } from '../../src/app/shared/utils/dashboard-rangos.util';

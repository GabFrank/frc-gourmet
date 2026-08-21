/**
 * Re-export del util de pago consolidado para el lado Electron.
 *
 * La logica vive en `src/app/shared/utils/` para que el handler y el componente
 * Angular compartan exactamente la misma aritmetica (mismo patron que
 * `monto-letras.util.ts` y `dashboard-rangos.util.ts`).
 */
export {
  decimalesDeMoneda,
  redondear,
  toleranciaDe,
  convertirLinea,
  validarSeleccion,
  validarCobertura,
  repartirFifo,
  imputadoPorItem,
  origenPorLinea,
  descripcionEvento,
} from '../../src/app/shared/utils/pago-consolidado.util';

export type {
  ItemAPagar,
  LineaDePago,
  FilaReparto,
} from '../../src/app/shared/utils/pago-consolidado.util';

/**
 * Re-export de `src/app/shared/utils/monto-letras.util.ts` — single source of
 * truth para conversión monto→letras. El módulo shared es TS puro sin
 * dependencias Electron/Angular, importable desde ambos lados.
 *
 * Mantenemos este archivo solo por compatibilidad con los imports relativos
 * desde otros utils de electron (`pdf.utils.ts`). Si querés cambiar la lógica,
 * editá `src/app/shared/utils/monto-letras.util.ts`.
 */
export {
  montoEnLetras,
  montoEnLetrasConPrefijo,
  enteroEnLetras,
  MonedaCode,
} from '../../src/app/shared/utils/monto-letras.util';

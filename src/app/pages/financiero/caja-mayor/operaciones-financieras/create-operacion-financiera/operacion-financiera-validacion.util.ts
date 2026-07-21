/**
 * Reglas de validación del formulario de Operación Financiera, extraídas como
 * datos puros para poder testearlas sin Angular.
 *
 * Bug corregido: en DEPOSITO_BANCARIO y RETIRO_BANCARIO la moneda no se elige en
 * la UI (se hereda de la cuenta bancaria), pero el validador exigía una de las
 * monedas (`monedaOrigenId` en depósito, `monedaDestinoId` en retiro). Al elegir
 * la cuenta solo se seteaba UNA de las dos, dejando la requerida en null → el
 * formulario quedaba inválido y el botón "Registrar" deshabilitado para siempre.
 *
 * Solución: al elegir la cuenta bancaria se setean AMBAS monedas (origen y
 * destino) con la moneda de la cuenta — en un depósito/retiro en efectivo la
 * divisa es la misma a ambos lados.
 */

export type TipoOperacionFinanciera =
  | 'CAMBIO_DIVISA'
  | 'DEPOSITO_BANCARIO'
  | 'RETIRO_BANCARIO'
  | 'TRANSFERENCIA_ENTRE_CAJAS';

/** Controles con `Validators.required` por tipo (además de descripcion/fecha). */
export const CAMPOS_REQUERIDOS: Record<TipoOperacionFinanciera, string[]> = {
  CAMBIO_DIVISA: [
    'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen',
    'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino', 'cotizacion',
  ],
  DEPOSITO_BANCARIO: [
    'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen',
    'cuentaBancariaDestinoId', 'montoDestino',
  ],
  RETIRO_BANCARIO: [
    'cuentaBancariaOrigenId', 'montoOrigen',
    'cajaMayorDestinoId', 'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino',
  ],
  TRANSFERENCIA_ENTRE_CAJAS: [
    'cajaMayorOrigenId', 'monedaOrigenId', 'formaPagoOrigenId', 'montoOrigen',
    'cajaMayorDestinoId', 'monedaDestinoId', 'formaPagoDestinoId', 'montoDestino',
  ],
};

/** Todos los controles de moneda del formulario. */
export const CAMPOS_MONEDA = ['monedaOrigenId', 'monedaDestinoId'];

/** Controles de moneda que el usuario elige DIRECTAMENTE en la UI, por tipo. */
export const MONEDAS_EN_UI: Record<TipoOperacionFinanciera, string[]> = {
  CAMBIO_DIVISA: ['monedaOrigenId', 'monedaDestinoId'],
  DEPOSITO_BANCARIO: [],            // se heredan de la cuenta bancaria
  RETIRO_BANCARIO: [],              // se heredan de la cuenta bancaria
  TRANSFERENCIA_ENTRE_CAJAS: ['monedaOrigenId', 'monedaDestinoId'],
};

/** ¿El tipo usa una cuenta bancaria de la que se hereda la moneda? */
export function usaCuentaBancaria(tipo: TipoOperacionFinanciera): boolean {
  return tipo === 'DEPOSITO_BANCARIO' || tipo === 'RETIRO_BANCARIO';
}

/**
 * Monedas a setear cuando se elige una cuenta bancaria. Setea AMBOS lados con la
 * misma moneda (depósito/retiro en efectivo = misma divisa origen y destino).
 */
export function monedasDesdeCuentaBancaria(monedaId: number): { monedaOrigenId: number; monedaDestinoId: number } {
  return { monedaOrigenId: monedaId, monedaDestinoId: monedaId };
}

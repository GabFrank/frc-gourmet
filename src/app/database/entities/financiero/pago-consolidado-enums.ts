/**
 * Enums del pago consolidado de obligaciones desde Caja Mayor.
 *
 * Un pago consolidado salda N obligaciones del MISMO concepto en un solo evento,
 * cobrando con N lineas (multi-moneda x multi-forma). Ver
 * `docs/planes/PLAN-PAGO-CONSOLIDADO-CAJA-MAYOR.md`.
 */

/**
 * Concepto del evento. Un pago consolidado cubre un unico concepto: asi el
 * movimiento consolidado conserva el `TipoMovimiento` real (EGRESO_GASTO,
 * EGRESO_VALE, ...) y los reportes por tipo siguen cuadrando.
 */
export enum PagoConcepto {
  COMPRA = 'COMPRA',
  GASTO = 'GASTO',
  VALE = 'VALE',
  LIQUIDACION_SUELDO = 'LIQUIDACION_SUELDO',
}

/**
 * Tipo de la obligacion pagada. Hoy hay uno por concepto, pero se mantienen
 * separados porque el concepto describe el EVENTO y el origen describe la FILA
 * (un concepto podria abarcar mas de un tipo de origen en el futuro).
 */
export enum PagoOrigenTipo {
  CPP_CUOTA = 'CPP_CUOTA',
  GASTO = 'GASTO',
  VALE = 'VALE',
  LIQUIDACION_SUELDO = 'LIQUIDACION_SUELDO',
}

export enum PagoConsolidadoEstado {
  ACTIVO = 'ACTIVO',
  ANULADO = 'ANULADO',
}

export enum PagoConsolidadoFuente {
  CAJA_MAYOR = 'CAJA_MAYOR',
  CUENTA_BANCARIA = 'CUENTA_BANCARIA',
}

/** Concepto -> tipo de origen de sus obligaciones. */
export const CONCEPTO_ORIGEN: Record<PagoConcepto, PagoOrigenTipo> = {
  [PagoConcepto.COMPRA]: PagoOrigenTipo.CPP_CUOTA,
  [PagoConcepto.GASTO]: PagoOrigenTipo.GASTO,
  [PagoConcepto.VALE]: PagoOrigenTipo.VALE,
  [PagoConcepto.LIQUIDACION_SUELDO]: PagoOrigenTipo.LIQUIDACION_SUELDO,
};

/** Solo las cuotas de compra admiten pago parcial. */
export const CONCEPTO_PERMITE_PARCIAL: Record<PagoConcepto, boolean> = {
  [PagoConcepto.COMPRA]: true,
  [PagoConcepto.GASTO]: false,
  [PagoConcepto.VALE]: false,
  [PagoConcepto.LIQUIDACION_SUELDO]: false,
};

/**
 * La nomina no se paga en una sola operacion: cada liquidacion se paga por
 * separado, para que su neteo (vales, cuotas CPP/CPC, aguinaldo, comisiones)
 * quede atado a un evento propio.
 */
export const CONCEPTO_SELECCION_UNICA: Record<PagoConcepto, boolean> = {
  [PagoConcepto.COMPRA]: false,
  [PagoConcepto.GASTO]: false,
  [PagoConcepto.VALE]: false,
  [PagoConcepto.LIQUIDACION_SUELDO]: true,
};

/** Solo compras agrupa por beneficiario (un pago = un proveedor). */
export const CONCEPTO_BENEFICIARIO_UNICO: Record<PagoConcepto, boolean> = {
  [PagoConcepto.COMPRA]: true,
  [PagoConcepto.GASTO]: false,
  [PagoConcepto.VALE]: false,
  [PagoConcepto.LIQUIDACION_SUELDO]: false,
};

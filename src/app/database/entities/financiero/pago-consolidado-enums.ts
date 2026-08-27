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
  /**
   * Cobro de cuotas de cuentas por cobrar. Es el unico concepto de sentido
   * INGRESO: entra plata en vez de salir. El motor no necesito un motor aparte
   * porque el signo del asiento ya se deriva de `esIngreso(tipoMovimiento)`.
   */
  COBRO_CLIENTE = 'COBRO_CLIENTE',
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
  CPC_CUOTA = 'CPC_CUOTA',
}

export enum PagoConsolidadoEstado {
  ACTIVO = 'ACTIVO',
  ANULADO = 'ANULADO',
}

export enum PagoConsolidadoFuente {
  CAJA_MAYOR = 'CAJA_MAYOR',
  CUENTA_BANCARIA = 'CUENTA_BANCARIA',
  /**
   * Descuento concedido al cliente. NO es una fuente de fondos: no mueve un
   * guarani ni de caja ni de banco. Cubre parte de la deuda para que la cuota
   * quede saldada, y deja su fila de detalle para poder responder despues
   * "cuanto pago el cliente y cuanto se le perdono".
   */
  DESCUENTO = 'DESCUENTO',
}

/** Concepto -> tipo de origen de sus obligaciones. */
export const CONCEPTO_ORIGEN: Record<PagoConcepto, PagoOrigenTipo> = {
  [PagoConcepto.COMPRA]: PagoOrigenTipo.CPP_CUOTA,
  [PagoConcepto.GASTO]: PagoOrigenTipo.GASTO,
  [PagoConcepto.VALE]: PagoOrigenTipo.VALE,
  [PagoConcepto.LIQUIDACION_SUELDO]: PagoOrigenTipo.LIQUIDACION_SUELDO,
  [PagoConcepto.COBRO_CLIENTE]: PagoOrigenTipo.CPC_CUOTA,
};

/** Solo las cuotas (de compra o de cobro) admiten pago parcial. */
export const CONCEPTO_PERMITE_PARCIAL: Record<PagoConcepto, boolean> = {
  [PagoConcepto.COMPRA]: true,
  [PagoConcepto.GASTO]: false,
  [PagoConcepto.VALE]: false,
  [PagoConcepto.LIQUIDACION_SUELDO]: false,
  [PagoConcepto.COBRO_CLIENTE]: true,
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
  [PagoConcepto.COBRO_CLIENTE]: false,
};

/**
 * Conceptos que agrupan por beneficiario: un pago = un proveedor, un cobro = un
 * cliente. Ademas de ser la operativa real del mostrador, es lo que hace que el
 * descuento tenga a quien atribuirse sin repartos arbitrarios.
 */
export const CONCEPTO_BENEFICIARIO_UNICO: Record<PagoConcepto, boolean> = {
  [PagoConcepto.COMPRA]: true,
  [PagoConcepto.GASTO]: false,
  [PagoConcepto.VALE]: false,
  [PagoConcepto.LIQUIDACION_SUELDO]: false,
  [PagoConcepto.COBRO_CLIENTE]: true,
};

/**
 * Mensaje del error de beneficiario unico, por concepto. Se lee solo cuando el
 * concepto esta en `CONCEPTO_BENEFICIARIO_UNICO`.
 */
export const CONCEPTO_BENEFICIARIO_UNICO_ERROR: Record<PagoConcepto, string> = {
  [PagoConcepto.COMPRA]: 'Un pago de compras cubre a un solo proveedor.',
  [PagoConcepto.GASTO]: '',
  [PagoConcepto.VALE]: '',
  [PagoConcepto.LIQUIDACION_SUELDO]: '',
  [PagoConcepto.COBRO_CLIENTE]: 'Un cobro cubre a un solo cliente.',
};

/**
 * Conceptos donde se puede conceder un descuento (condonar parte de la deuda).
 * Solo aplica a lo que se le cobra a un cliente: no se "descuenta" un vale ni un
 * salario, y una deuda con un proveedor se renegocia con el proveedor, no desde
 * la caja.
 */
export const CONCEPTO_PERMITE_DESCUENTO: Record<PagoConcepto, boolean> = {
  [PagoConcepto.COMPRA]: false,
  [PagoConcepto.GASTO]: false,
  [PagoConcepto.VALE]: false,
  [PagoConcepto.LIQUIDACION_SUELDO]: false,
  [PagoConcepto.COBRO_CLIENTE]: true,
};

/**
 * Sentido del dinero del concepto: true = entra (ingreso), false = sale (egreso).
 *
 * ⚠️ Es el ESPEJO de `esIngreso(adapter.tipoMovimiento)` (`caja-mayor-utils.ts`),
 * que es la fuente de verdad del backend. Existe por separado porque el renderer
 * no puede importar codigo de `electron/`. Si se agrega un concepto, las dos
 * tienen que coincidir — `scripts/test-pago-consolidado.ts` lo verifica.
 */
export const CONCEPTO_ES_INGRESO: Record<PagoConcepto, boolean> = {
  [PagoConcepto.COMPRA]: false,
  [PagoConcepto.GASTO]: false,
  [PagoConcepto.VALE]: false,
  [PagoConcepto.LIQUIDACION_SUELDO]: false,
  [PagoConcepto.COBRO_CLIENTE]: true,
};

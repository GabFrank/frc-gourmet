export enum CajaMayorEstado {
  ABIERTA = 'ABIERTA',
  CERRADA = 'CERRADA'
}

export enum TipoMovimiento {
  INGRESO_RETIRO_CAJA = 'INGRESO_RETIRO_CAJA',
  INGRESO_CIERRE_CAJA = 'INGRESO_CIERRE_CAJA',
  INGRESO_ENTRADA_VARIA = 'INGRESO_ENTRADA_VARIA',
  INGRESO_OPERACION_FINANCIERA = 'INGRESO_OPERACION_FINANCIERA',
  INGRESO_RETIRO_BANCO = 'INGRESO_RETIRO_BANCO',
  INGRESO_COBRO_CLIENTE = 'INGRESO_COBRO_CLIENTE',
  INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO = 'INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO',
  TRANSFERENCIA_ENTRADA = 'TRANSFERENCIA_ENTRADA',
  AJUSTE_POSITIVO = 'AJUSTE_POSITIVO',
  EGRESO_GASTO = 'EGRESO_GASTO',
  EGRESO_COMPRA = 'EGRESO_COMPRA',
  EGRESO_CUOTA_COMPRA = 'EGRESO_CUOTA_COMPRA',
  EGRESO_CUOTA_PRESTAMO = 'EGRESO_CUOTA_PRESTAMO',
  EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO = 'EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO',
  EGRESO_VALE = 'EGRESO_VALE',
  EGRESO_SALARIO = 'EGRESO_SALARIO',
  EGRESO_CHEQUE = 'EGRESO_CHEQUE',
  EGRESO_OPERACION_FINANCIERA = 'EGRESO_OPERACION_FINANCIERA',
  EGRESO_DEPOSITO_BANCO = 'EGRESO_DEPOSITO_BANCO',
  EGRESO_CAJA_INICIAL = 'EGRESO_CAJA_INICIAL',
  TRANSFERENCIA_SALIDA = 'TRANSFERENCIA_SALIDA',
  AJUSTE_NEGATIVO = 'AJUSTE_NEGATIVO',
  ANULACION = 'ANULACION'
}

export enum GastoEstado {
  PENDIENTE = 'PENDIENTE',
  PAGADO = 'PAGADO',
  PROGRAMADO = 'PROGRAMADO',
  CANCELADO = 'CANCELADO'
}

export enum GastoFrecuencia {
  DIARIO = 'DIARIO',
  SEMANAL = 'SEMANAL',
  QUINCENAL = 'QUINCENAL',
  MENSUAL = 'MENSUAL',
  BIMESTRAL = 'BIMESTRAL',
  TRIMESTRAL = 'TRIMESTRAL',
  SEMESTRAL = 'SEMESTRAL',
  ANUAL = 'ANUAL'
}

export enum RetiroCajaEstado {
  FLOTANTE = 'FLOTANTE',
  VINCULADO_PENDIENTE = 'VINCULADO_PENDIENTE',
  INGRESADO = 'INGRESADO'
}

/**
 * Origen de un RetiroCaja:
 * - MANUAL (default): retiro suelto creado por el usuario.
 * - CIERRE: generado desde el cierre de una caja (retiro del efectivo contado).
 *   Al ingresarlo a caja mayor se registra como `INGRESO_CIERRE_CAJA` (en vez de
 *   `INGRESO_RETIRO_CAJA`) para distinguirlo en reportes.
 */
export enum RetiroCajaOrigen {
  MANUAL = 'MANUAL',
  CIERRE = 'CIERRE'
}

/**
 * Destino del egreso de un Gasto.
 * - CAJA_MAYOR (default): el gasto descuenta el saldo de la caja mayor en el
 *   bucket (moneda × forma de pago) del detalle. Caso histórico/cash-like.
 * - CUENTA_BANCARIA: el gasto debita directamente `cuenta_bancaria.saldo`. NO
 *   genera movimiento en caja mayor. La columna `caja_mayor_id` queda igual
 *   (metadata "desde qué caja se registró"), pero sin impacto en saldos.
 */
export enum GastoDestinoTipo {
  CAJA_MAYOR = 'CAJA_MAYOR',
  CUENTA_BANCARIA = 'CUENTA_BANCARIA'
}

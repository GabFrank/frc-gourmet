/**
 * Enum for compra states
 */
export enum CompraEstado {
  ABIERTO = 'ABIERTO',
  ACTIVO = 'ACTIVO',
  FINALIZADO = 'FINALIZADO',
  CANCELADO = 'CANCELADO'
}

/**
 * Enum for pago states
 */
export enum PagoEstado {
  ABIERTO = 'ABIERTO',
  PAGO_PARCIAL = 'PAGO_PARCIAL',
  PAGADO = 'PAGADO',
  CANCELADO = 'CANCELADO'
}

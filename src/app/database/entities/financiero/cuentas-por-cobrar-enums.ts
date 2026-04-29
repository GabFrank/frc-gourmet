export enum CuentaPorCobrarTipo {
  CREDITO_VENTA = 'CREDITO_VENTA',
  PRESTAMO_CLIENTE = 'PRESTAMO_CLIENTE',
  OTRO = 'OTRO'
}

export enum CuentaPorCobrarEstado {
  ACTIVO = 'ACTIVO',
  COBRADO = 'COBRADO',
  CANCELADO = 'CANCELADO'
}

export enum CuentaPorCobrarCuotaEstado {
  PENDIENTE = 'PENDIENTE',
  PARCIAL = 'PARCIAL',
  COBRADO = 'COBRADO',
  CANCELADO = 'CANCELADO'
}

export enum MovimientoClienteTipo {
  CARGO = 'CARGO',
  PAGO = 'PAGO',
  AJUSTE_POSITIVO = 'AJUSTE_POSITIVO',
  AJUSTE_NEGATIVO = 'AJUSTE_NEGATIVO'
}

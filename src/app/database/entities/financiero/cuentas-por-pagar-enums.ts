export enum CuotaEstado {
  PENDIENTE = 'PENDIENTE',
  PARCIAL = 'PARCIAL',
  PAGADA = 'PAGADA',
  VENCIDA = 'VENCIDA'
}

export enum CuentaPorPagarEstado {
  ACTIVO = 'ACTIVO',
  PAGADO = 'PAGADO',
  CANCELADO = 'CANCELADO'
}

export enum CuentaPorPagarTipo {
  COMPRA = 'COMPRA',
  PRESTAMO = 'PRESTAMO',
  PRESTAMO_FUNCIONARIO = 'PRESTAMO_FUNCIONARIO',
  OTRO = 'OTRO'
}

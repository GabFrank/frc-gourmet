export enum TipoOperacionFinanciera {
  CAMBIO_DIVISA = 'CAMBIO_DIVISA',
  DEPOSITO_BANCARIO = 'DEPOSITO_BANCARIO',
  RETIRO_BANCARIO = 'RETIRO_BANCARIO',
  TRANSFERENCIA_ENTRE_CAJAS = 'TRANSFERENCIA_ENTRE_CAJAS',
  // Transferencia interna banco → banco (posible entre monedas distintas con
  // cotización). No toca la caja mayor: solo mueve saldo entre dos cuentas
  // bancarias (débito en origen, crédito en destino).
  TRANSFERENCIA_BANCARIA = 'TRANSFERENCIA_BANCARIA',
}

export enum DiferenciaDestinoTipo {
  GASTO = 'GASTO',
  VALE = 'VALE',
  IGNORAR = 'IGNORAR',
}

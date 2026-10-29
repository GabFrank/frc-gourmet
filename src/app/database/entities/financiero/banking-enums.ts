export enum TipoCuentaBancaria {
  CORRIENTE = 'CORRIENTE',
  AHORRO = 'AHORRO'
}

export enum AcreditacionPosEstado {
  PENDIENTE = 'PENDIENTE',
  ACREDITADO_AUTO = 'ACREDITADO_AUTO',
  VERIFICADO = 'VERIFICADO',
  CON_DIFERENCIA = 'CON_DIFERENCIA'
}

// ── Acreditaciones POS por medio de pago (issue #320) ──
export enum MedioPos {
  QR = 'QR',
  DEBITO = 'DEBITO',
  CREDITO = 'CREDITO'
}

export enum TipoDiasAcreditacion {
  HABILES = 'HABILES',
  CORRIDOS = 'CORRIDOS'
}

export enum BasePlazoAcreditacion {
  PROCESO = 'PROCESO',
  TRANSACCION = 'TRANSACCION'
}

export enum ModoAcreditacionPos {
  NETO = 'NETO',
  BRUTO_COMISION_APARTE = 'BRUTO_COMISION_APARTE'
}

export enum ConciliacionPosEstado {
  ACTIVA = 'ACTIVA',
  DESHECHA = 'DESHECHA'
}

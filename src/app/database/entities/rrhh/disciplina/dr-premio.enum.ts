export enum DrPremioPeriodo {
  SEMANAL = 'SEMANAL',
  QUINCENAL = 'QUINCENAL',
  MENSUAL = 'MENSUAL',
}

export enum DrPremioMetodo {
  CRITERIOS = 'CRITERIOS',
  VOTACION = 'VOTACION',
  SALDO_PUNTOS = 'SALDO_PUNTOS',
}

export enum DrReglaEmpate {
  /** Se reparte el monto entre los empatados (guaraníes enteros). */
  DIVIDIR = 'DIVIDIR',
  /** Cada empatado cobra el monto completo. */
  MONTO_COMPLETO_CADA_UNO = 'MONTO_COMPLETO_CADA_UNO',
  /** Si hay empate el premio queda desierto. */
  DESIERTO = 'DESIERTO',
}

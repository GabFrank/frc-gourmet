/** Cómo se aplica una falta: a una persona o a todos los presentes del día (crea un lote). */
export enum DrModoAplicacion {
  INDIVIDUAL = 'INDIVIDUAL',
  TODOS_PRESENTES = 'TODOS_PRESENTES',
}

/** Ventana en la que se cuentan las ocurrencias previas de una falta. */
export enum DrReinicio {
  NUNCA = 'NUNCA',
  SEMANAL = 'SEMANAL',
  MENSUAL = 'MENSUAL',
}

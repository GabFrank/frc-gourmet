/**
 * Protección de las Penalizaciones y Bonos creados por el módulo
 * Disciplina y Reconocimiento (DR).
 *
 * Una multa o premio aprobado en DR se materializa como Penalizacion / Bono
 * normal (así la liquidación lo toma sin cambios), con la descripción o el
 * motivo prefijado con «[DR]». Esos registros solo se editan o anulan desde el
 * módulo DR, para que la trazabilidad (falta → aprobación → penalización) no se
 * rompa desde las pantallas viejas.
 */
export const PREFIJO_DR = '[DR]';

const LECTURA_COMUN = [
  'RRHH_FUNCIONARIO_VER',
  'RRHH_DASHBOARD_VER',
  'RRHH_REPORTE_GENERAR',
  'RRHH_LIQUIDACION_GENERAR',
  'RRHH_LIQUIDACION_APROBAR',
  'RRHH_LIQUIDACION_PAGAR',
  'RRHH_LIQUIDACION_ANULAR',
  'RRHH_DR_APROBAR',
];

/** Permisos (OR) para listar penalizaciones: los que hoy usan esas pantallas. */
export const PERMISOS_LECTURA_PENALIZACIONES = ['RRHH_PENALIZACION_REGISTRAR', ...LECTURA_COMUN];

/** Permisos (OR) para listar bonos. */
export const PERMISOS_LECTURA_BONOS = ['RRHH_BONO_OTORGAR', ...LECTURA_COMUN];

export function esRegistroDr(texto: string | null | undefined): boolean {
  return typeof texto === 'string' && texto.trim().toUpperCase().startsWith(PREFIJO_DR);
}

/** Lanza si el registro es del módulo DR (o si se intenta crear uno con el prefijo desde fuera). */
export function bloquearSiEsDr(texto: string | null | undefined, que: 'PENALIZACION' | 'BONO'): void {
  if (esRegistroDr(texto)) {
    const err: any = new Error(
      `${que} DE DISCIPLINA Y RECONOCIMIENTO: SOLO SE MODIFICA O ANULA DESDE ESE MÓDULO`,
    );
    err.code = 'FORBIDDEN';
    throw err;
  }
}

/**
 * Motor de multas (puro). Ver PLAN-multas-premios-encuestas §3, §5 y §12.
 *
 * Reglas:
 *  - n_ocurrencia = 1 + faltas previas del mismo funcionario y tipo, con estado distinto de
 *    ANULADA/JUSTIFICADA, dentro de la ventana de reinicio (NUNCA: todas; SEMANAL: desde el
 *    inicio de la semana del hecho; MENSUAL: desde el día 1 del mes del hecho) y con fecha
 *    <= fecha del hecho.
 *  - n <= advertencias_previas → ADVERTENCIA (₲0); si no → MULTA con escala_montos[n] o,
 *    si la escala no define ese n, monto_multa.
 *  - Tardanza: si minutos <= tolerancia → NINGUNO (o ADVERTENCIA de tolerancia si
 *    `advertirDentroTolerancia`); en ese caso nOcurrencia = 0 y no escala.
 */
import { DisciplinaError } from './errores';
import { inicioMes, inicioSemana, normalizarFecha } from './fechas';

export type ReinicioFalta = 'NUNCA' | 'SEMANAL' | 'MENSUAL';
export type EstadoFalta = 'REGISTRADA' | 'APELADA' | 'APROBADA' | 'JUSTIFICADA' | 'ANULADA';
export type ResultadoFalta = 'ADVERTENCIA' | 'MULTA' | 'NINGUNO';

/** Estados que NO cuentan para el n.º de ocurrencia. */
export const ESTADOS_FALTA_NO_CUENTAN: ReadonlyArray<EstadoFalta> = ['ANULADA', 'JUSTIFICADA'];

export interface TipoFaltaConfig {
  advertenciasPrevias: number;
  montoMulta: number;
  /** Monto por n.º de ocurrencia: { "2": 50000, "3": 80000 }. Opcional. */
  escalaMontos?: Record<string | number, number> | null;
  reinicio: ReinicioFalta;
  toleranciaMinutos?: number | null;
}

export interface FaltaPrevia {
  fecha: string; // 'YYYY-MM-DD'
  estado: EstadoFalta;
}

export interface OpcionesCalculoMulta {
  /** Día ISO de inicio de semana para reinicio SEMANAL: 1 = lunes (default) … 7 = domingo. */
  inicioSemana?: number;
  /** Minutos de tardanza (solo para faltas de tipo tardanza). */
  minutosTardanza?: number | null;
  /** Dentro de la tolerancia: true → ADVERTENCIA de tolerancia; false (default) → NINGUNO. */
  advertirDentroTolerancia?: boolean;
}

export interface ResultadoCalculoMulta {
  nOcurrencia: number;
  resultado: ResultadoFalta;
  monto: number;
  /** true si la tardanza quedó dentro de la tolerancia (no cuenta como ocurrencia). */
  dentroTolerancia: boolean;
}

/** Inicio (inclusive) de la ventana de conteo, o null si no hay reinicio. */
export function inicioVentana(reinicio: ReinicioFalta, fechaHecho: string, inicioSemanaIso = 1): string | null {
  switch (reinicio) {
    case 'NUNCA': return null;
    case 'SEMANAL': return inicioSemana(fechaHecho, inicioSemanaIso);
    case 'MENSUAL': return inicioMes(fechaHecho);
    default: throw new DisciplinaError('REINICIO_INVALIDO', `REINICIO INVÁLIDO: ${reinicio}`);
  }
}

/** Cantidad de faltas previas que cuentan dentro de la ventana. */
export function contarFaltasPrevias(
  previas: ReadonlyArray<FaltaPrevia>,
  reinicio: ReinicioFalta,
  fechaHecho: string,
  inicioSemanaIso = 1,
): number {
  const hasta = normalizarFecha(fechaHecho);
  const desde = inicioVentana(reinicio, hasta, inicioSemanaIso);
  return previas.filter((f) => {
    if (ESTADOS_FALTA_NO_CUENTAN.includes(f.estado)) return false;
    const fecha = normalizarFecha(f.fecha);
    if (fecha > hasta) return false;
    return desde === null || fecha >= desde;
  }).length;
}

/** Monto de la multa para la ocurrencia n (escala si la define, si no monto_multa). */
export function montoParaOcurrencia(tipo: TipoFaltaConfig, n: number): number {
  const escala = tipo.escalaMontos;
  if (escala && Object.prototype.hasOwnProperty.call(escala, String(n))) {
    const v = Number((escala as Record<string, number>)[String(n)]);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return Number(tipo.montoMulta) || 0;
}

export function calcularMulta(
  tipo: TipoFaltaConfig,
  previas: ReadonlyArray<FaltaPrevia>,
  fechaHecho: string,
  opciones: OpcionesCalculoMulta = {},
): ResultadoCalculoMulta {
  const tol = tipo.toleranciaMinutos;
  const min = opciones.minutosTardanza;
  if (tol != null && min != null && Number(min) <= Number(tol)) {
    return {
      nOcurrencia: 0,
      resultado: opciones.advertirDentroTolerancia ? 'ADVERTENCIA' : 'NINGUNO',
      monto: 0,
      dentroTolerancia: true,
    };
  }
  const n = contarFaltasPrevias(previas, tipo.reinicio, fechaHecho, opciones.inicioSemana ?? 1) + 1;
  if (n <= Number(tipo.advertenciasPrevias || 0)) {
    return { nOcurrencia: n, resultado: 'ADVERTENCIA', monto: 0, dentroTolerancia: false };
  }
  return { nOcurrencia: n, resultado: 'MULTA', monto: montoParaOcurrencia(tipo, n), dentroTolerancia: false };
}

/**
 * §12: se ignora la tardanza de un día si ya existe una Penalizacion automática ese día
 * (aunque sea ₲0), para no descontar dos veces.
 * @param fechasPenalizacionAuto fechas ('YYYY-MM-DD' o ISO) de penalizaciones automáticas del funcionario.
 */
export function debeIgnorarTardanza(fechaHecho: string, fechasPenalizacionAuto: ReadonlyArray<string>): boolean {
  const dia = normalizarFecha(fechaHecho);
  return fechasPenalizacionAuto.some((f) => normalizarFecha(f) === dia);
}

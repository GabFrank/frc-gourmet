/**
 * Motor de premios (puro). Ver PLAN §3 y §12.
 *  - CRITERIOS: suma de puntajes del período por funcionario.
 *  - SALDO_PUNTOS: puntos_iniciales − Σ puntos de errores VIGENTES.
 *  - VOTACION: Σ suma_ponderada / Σ suma_pesos sobre preguntas ESCALA y SI_NO (Sí=1/No=0);
 *    TEXTO no puntúa. Sin votos → puntaje 0.
 *  - Empates: DIVIDIR (monto/n en guaraníes enteros; el resto va al primero en orden
 *    alfabético por nombre), MONTO_COMPLETO_CU (cada empatado cobra el monto completo),
 *    DESIERTO (nadie cobra).
 *  - VOTACION con menos votantes que el mínimo (default 4) → DESIERTO.
 * Idempotente: mismas entradas → mismo resultado.
 */
import { Id } from './errores';
import { AgregadoVoto, TipoPregunta } from './votacion';

export type MetodoPremio = 'CRITERIOS' | 'VOTACION' | 'SALDO_PUNTOS';
export type ReglaEmpate = 'DIVIDIR' | 'MONTO_COMPLETO_CU' | 'DESIERTO';
export type EstadoResultadoPremio = 'GANADOR' | 'EMPATE' | 'DESIERTO';
export type MotivoDesierto = 'SIN_PARTICIPANTES' | 'MINIMO_VOTANTES' | 'EMPATE_DESIERTO';

export const MIN_VOTANTES_DEFAULT = 4;
const EPS = 1e-9;

export interface FuncionarioPremio {
  id: Id;
  nombre: string;
}

export interface PuntajeFuncionario {
  funcionarioId: Id;
  nombre: string;
  puntaje: number;
}

export interface PuntajeCriterioInput {
  funcionarioId: Id;
  valor: number;
}

export interface ErrorPuntosInput {
  funcionarioId: Id;
  puntos: number;
  estado: 'VIGENTE' | 'ANULADO';
}

export interface AgregadoEvaluado extends AgregadoVoto {
  evaluadoId: Id;
  tipoPregunta: TipoPregunta;
}

export interface FilaRanking extends PuntajeFuncionario {
  posicion: number;
  ganador: boolean;
  montoPropuesto: number;
}

export interface ResultadoPremio {
  estado: EstadoResultadoPremio;
  motivoDesierto?: MotivoDesierto;
  ranking: FilaRanking[];
}

const k = (id: Id) => String(id);

function porNombre(a: { nombre: string }, b: { nombre: string }): number {
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
}

export function calcularCriterios(
  funcionarios: ReadonlyArray<FuncionarioPremio>,
  puntajes: ReadonlyArray<PuntajeCriterioInput>,
): PuntajeFuncionario[] {
  const suma = new Map<string, number>();
  for (const p of puntajes) suma.set(k(p.funcionarioId), (suma.get(k(p.funcionarioId)) ?? 0) + Number(p.valor || 0));
  return funcionarios.map((f) => ({ funcionarioId: f.id, nombre: f.nombre, puntaje: suma.get(k(f.id)) ?? 0 }));
}

export function calcularSaldoPuntos(
  funcionarios: ReadonlyArray<FuncionarioPremio>,
  puntosIniciales: number,
  errores: ReadonlyArray<ErrorPuntosInput>,
): PuntajeFuncionario[] {
  const desc = new Map<string, number>();
  for (const e of errores) {
    if (e.estado !== 'VIGENTE') continue;
    desc.set(k(e.funcionarioId), (desc.get(k(e.funcionarioId)) ?? 0) + Number(e.puntos || 0));
  }
  return funcionarios.map((f) => ({
    funcionarioId: f.id,
    nombre: f.nombre,
    puntaje: Number(puntosIniciales || 0) - (desc.get(k(f.id)) ?? 0),
  }));
}

export function calcularVotacion(
  funcionarios: ReadonlyArray<FuncionarioPremio>,
  agregados: ReadonlyArray<AgregadoEvaluado>,
): PuntajeFuncionario[] {
  const num = new Map<string, number>();
  const den = new Map<string, number>();
  for (const a of agregados) {
    if (a.tipoPregunta !== 'ESCALA' && a.tipoPregunta !== 'SI_NO') continue;
    const id = k(a.evaluadoId);
    num.set(id, (num.get(id) ?? 0) + Number(a.sumaPonderada || 0));
    den.set(id, (den.get(id) ?? 0) + Number(a.sumaPesos || 0));
  }
  return funcionarios.map((f) => {
    const d = den.get(k(f.id)) ?? 0;
    return { funcionarioId: f.id, nombre: f.nombre, puntaje: d > 0 ? (num.get(k(f.id)) ?? 0) / d : 0 };
  });
}

/** Ranking descendente por puntaje (empates comparten posición: 1,1,3); desempate de orden alfabético. */
export function rankear(puntajes: ReadonlyArray<PuntajeFuncionario>): Omit<FilaRanking, 'ganador' | 'montoPropuesto'>[] {
  const ord = puntajes.slice().sort((a, b) => (Math.abs(b.puntaje - a.puntaje) > EPS ? b.puntaje - a.puntaje : porNombre(a, b)));
  let pos = 0;
  return ord.map((p, i) => {
    if (i === 0 || Math.abs(ord[i - 1].puntaje - p.puntaje) > EPS) pos = i + 1;
    return { ...p, posicion: pos };
  });
}

/** Reparte un monto en n partes enteras; el resto va a la primera. */
export function dividirMonto(monto: number, n: number): number[] {
  const total = Math.round(Number(monto) || 0);
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

export interface ResolverPremioInput {
  metodo: MetodoPremio;
  monto: number;
  reglaEmpate: ReglaEmpate;
  puntajes: ReadonlyArray<PuntajeFuncionario>;
  /** Solo VOTACION: cantidad de participaciones del período. */
  cantidadVotantes?: number;
  /** Solo VOTACION: `dr.votacion.min_votantes` (default 4). */
  minVotantes?: number;
}

export function resolverPremio(input: ResolverPremioInput): ResultadoPremio {
  const ranking: FilaRanking[] = rankear(input.puntajes).map((r) => ({ ...r, ganador: false, montoPropuesto: 0 }));
  const desierto = (motivo: MotivoDesierto): ResultadoPremio => ({ estado: 'DESIERTO', motivoDesierto: motivo, ranking });

  if (ranking.length === 0) return desierto('SIN_PARTICIPANTES');
  if (input.metodo === 'VOTACION') {
    const min = input.minVotantes ?? MIN_VOTANTES_DEFAULT;
    if ((input.cantidadVotantes ?? 0) < min) return desierto('MINIMO_VOTANTES');
  }

  const primeros = ranking.filter((r) => r.posicion === 1); // ya en orden alfabético
  const monto = Math.round(Number(input.monto) || 0);
  if (primeros.length === 1) {
    primeros[0].ganador = true;
    primeros[0].montoPropuesto = monto;
    return { estado: 'GANADOR', ranking };
  }
  switch (input.reglaEmpate) {
    case 'DESIERTO':
      return desierto('EMPATE_DESIERTO');
    case 'MONTO_COMPLETO_CU':
      primeros.forEach((p) => { p.ganador = true; p.montoPropuesto = monto; });
      return { estado: 'EMPATE', ranking };
    case 'DIVIDIR':
    default: {
      const partes = dividirMonto(monto, primeros.length);
      primeros.forEach((p, i) => { p.ganador = true; p.montoPropuesto = partes[i]; });
      return { estado: 'EMPATE', ranking };
    }
  }
}

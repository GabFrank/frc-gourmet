/**
 * Lógica pura de matching facial 1:N (sin Electron, sin DB, sin ML).
 * Aislada para poder testearla directamente. La usa `asistencia-facial.handler`.
 */

export interface RostroCacheItem {
  funcionarioId: number;
  vector: number[];
  norm: number;
  modelo: string;
  dimension: number;
}

export interface MatchResult {
  matched: boolean;
  funcionarioId?: number;
  similitud: number;
  reason?: 'SIN_ROSTROS' | 'NO_MATCH' | 'BAJO_MARGEN';
}

/** Norma L2 de un vector. */
export function l2Norm(vector: number[]): number {
  return Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
}

/** Construye un item de cache (calcula la norma) desde un vector crudo. */
export function buildRostroCacheItem(funcionarioId: number, vector: number[], modelo = 'TEST'): RostroCacheItem {
  return { funcionarioId, vector, norm: l2Norm(vector), modelo, dimension: vector.length };
}

/** Similitud coseno entre el query (con su norma) y un rostro cacheado. */
export function cosineSim(query: number[], queryNorm: number, item: RostroCacheItem): number {
  if (query.length !== item.vector.length) return -1;
  let dot = 0;
  for (let i = 0; i < query.length; i++) dot += query[i] * item.vector[i];
  return dot / (queryNorm * item.norm);
}

/**
 * Elige el mejor funcionario para un embedding query (coseno), aplicando umbral
 * absoluto y margen contra el 2º mejor candidato. Función pura.
 */
export function elegirMejorMatch(
  query: number[],
  cache: RostroCacheItem[],
  umbral: number,
  margenMin: number,
): MatchResult {
  const queryNorm = l2Norm(query);
  const mejorPorFuncionario = new Map<number, number>();
  for (const item of cache) {
    if (item.dimension !== query.length) continue;
    const sim = cosineSim(query, queryNorm, item);
    const prev = mejorPorFuncionario.get(item.funcionarioId);
    if (prev === undefined || sim > prev) mejorPorFuncionario.set(item.funcionarioId, sim);
  }
  if (mejorPorFuncionario.size === 0) return { matched: false, similitud: -1, reason: 'SIN_ROSTROS' };

  const ranking = [...mejorPorFuncionario.entries()].sort((a, b) => b[1] - a[1]);
  const [mejorFuncId, mejorSim] = ranking[0];
  const segundoSim = ranking.length > 1 ? ranking[1][1] : -1;
  const similitud = +mejorSim.toFixed(4);

  if (mejorSim < umbral) return { matched: false, similitud, reason: 'NO_MATCH' };
  if (ranking.length > 1 && (mejorSim - segundoSim) < margenMin) {
    return { matched: false, similitud, reason: 'BAJO_MARGEN' };
  }
  return { matched: true, funcionarioId: mejorFuncId, similitud };
}

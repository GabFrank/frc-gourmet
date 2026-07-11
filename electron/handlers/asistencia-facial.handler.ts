import { ipcMain } from 'electron';
import { DataSource, IsNull } from 'typeorm';
import { FuncionarioRostro } from '../../src/app/database/entities/rrhh/funcionario-rostro.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { FuncionarioTurno } from '../../src/app/database/entities/rrhh/funcionario-turno.entity';
import { Asistencia } from '../../src/app/database/entities/rrhh/asistencia.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';
import { deleteImageByUrl } from '../utils/image-resize.utils';
import { getConfigNumber, getConfigBoolean } from './configuracion-rrhh.handler';
import { crearAsistenciaInterno } from './asistencias.handler';
import { parseLocalDate } from '../utils/date.utils';

/**
 * Reconocimiento facial para fichaje de asistencia.
 *
 * F2 (enrollment): registrar / listar / eliminar rostros de un funcionario.
 * F3 (fichaje): `fichar-facial` — match 1:N contra los embeddings registrados.
 *
 * El embedding lo genera el cliente on-device (@vladmandic/human); acá NUNCA se
 * procesa una imagen. Se guarda como JSON string en `funcionario_rostros.embedding`.
 */

/** Cache invalidable de embeddings activos (lo usa el match de F3). */
let rostrosCacheDirty = true;
export function invalidarCacheRostros(): void {
  rostrosCacheDirty = true;
}
export function isCacheRostrosDirty(): boolean {
  return rostrosCacheDirty;
}
export function marcarCacheRostrosLimpio(): void {
  rostrosCacheDirty = false;
}

interface RostroCacheItem {
  funcionarioId: number;
  vector: number[];
  norm: number;
  modelo: string;
  dimension: number;
}
let rostrosCache: RostroCacheItem[] = [];

/** Carga (o refresca) en memoria los embeddings activos para el match. */
async function getRostrosCache(dataSource: DataSource): Promise<RostroCacheItem[]> {
  if (!rostrosCacheDirty) return rostrosCache;
  const repo = dataSource.getRepository(FuncionarioRostro);
  const rostros = await repo.find({ where: { activo: true }, relations: ['funcionario'] });
  rostrosCache = rostros
    .map((r) => {
      let vector: number[];
      try {
        vector = JSON.parse(r.embedding);
      } catch {
        return null;
      }
      if (!Array.isArray(vector) || !vector.length) return null;
      return {
        funcionarioId: (r.funcionario as any)?.id,
        vector,
        norm: Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1,
        modelo: r.modelo,
        dimension: r.dimension,
      } as RostroCacheItem;
    })
    .filter((x): x is RostroCacheItem => !!x && !!x.funcionarioId);
  marcarCacheRostrosLimpio();
  return rostrosCache;
}

/** Similitud coseno entre el query (con norma) y un rostro cacheado. */
function cosineSim(query: number[], queryNorm: number, item: RostroCacheItem): number {
  if (query.length !== item.vector.length) return -1;
  let dot = 0;
  for (let i = 0; i < query.length; i++) dot += query[i] * item.vector[i];
  return dot / (queryNorm * item.norm);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function horaHHmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fechaYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function diffHoras(horaEntrada: string, horaSalida: string): number {
  const [h1, m1] = horaEntrada.split(':').map(Number);
  const [h2, m2] = horaSalida.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60; // cruzó medianoche
  return +(mins / 60).toFixed(2);
}

export function registerAsistenciaFacialHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
): void {
  // --- Enrollment: registrar un rostro ---
  ipcMain.handle('enrolar-rostro', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_FUNCIONARIO_EDITAR');
    if (!data?.funcionarioId) throw new Error('Funcionario requerido');
    const embedding = data?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Embedding facial invalido');
    }
    const funcionario = await dataSource.getRepository(Funcionario).findOne({ where: { id: data.funcionarioId } });
    if (!funcionario) throw new Error(`Funcionario ${data.funcionarioId} no encontrado`);

    const repo = dataSource.getRepository(FuncionarioRostro);
    const entity = repo.create({
      funcionario,
      embedding: JSON.stringify(embedding),
      dimension: Number(data.dimension) || embedding.length,
      modelo: String(data.modelo || '').toUpperCase() || 'DESCONOCIDO',
      thumbnailUrl: data.thumbnailUrl || undefined,
      activo: true,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    const saved = await repo.save(entity);
    invalidarCacheRostros();
    // No devolvemos el embedding (payload pesado / privacidad)
    return { id: saved.id, funcionarioId: funcionario.id, modelo: saved.modelo, dimension: saved.dimension };
  });

  // --- Listar rostros de un funcionario (sin el embedding) ---
  ipcMain.handle('get-rostros-funcionario', async (_e, funcionarioId: number) => {
    const repo = dataSource.getRepository(FuncionarioRostro);
    const rostros = await repo.find({
      where: { funcionario: { id: funcionarioId }, activo: true },
      order: { createdAt: 'DESC' },
    });
    return rostros.map((r) => ({
      id: r.id,
      modelo: r.modelo,
      dimension: r.dimension,
      thumbnailUrl: r.thumbnailUrl,
      createdAt: r.createdAt,
    }));
  });

  // --- Eliminar (hard delete) un rostro registrado ---
  ipcMain.handle('eliminar-rostro', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_FUNCIONARIO_EDITAR');
    const repo = dataSource.getRepository(FuncionarioRostro);
    const rostro = await repo.findOne({ where: { id } });
    if (!rostro) throw new Error(`Rostro ${id} no encontrado`);
    if (rostro.thumbnailUrl) {
      try { deleteImageByUrl(rostro.thumbnailUrl); } catch { /* best-effort */ }
    }
    await repo.remove(rostro);
    invalidarCacheRostros();
    return { ok: true };
  });

  // --- Fichaje: identificar por rostro y marcar entrada/salida ---
  ipcMain.handle('fichar-facial', async (_e, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_ASISTENCIA_REGISTRAR');
    const query = payload?.embedding;
    if (!Array.isArray(query) || !query.length) throw new Error('Embedding facial invalido');

    // Liveness
    const livenessObligatorio = await getConfigBoolean(dataSource, 'FACIAL_LIVENESS_OBLIGATORIO', true);
    if (livenessObligatorio && payload?.livenessOk !== true) {
      return { matched: false, reason: 'LIVENESS' };
    }

    // Match 1:N (coseno) — mejor por funcionario + margen contra el 2º
    const umbral = await getConfigNumber(dataSource, 'FACIAL_UMBRAL_SIMILITUD', 0.6);
    const margenMin = await getConfigNumber(dataSource, 'FACIAL_MARGEN_MIN', 0.05);
    const cache = await getRostrosCache(dataSource);
    const queryNorm = Math.sqrt(query.reduce((s: number, v: number) => s + v * v, 0)) || 1;

    const mejorPorFuncionario = new Map<number, number>();
    for (const item of cache) {
      if (item.dimension !== query.length) continue;
      const sim = cosineSim(query, queryNorm, item);
      const prev = mejorPorFuncionario.get(item.funcionarioId);
      if (prev === undefined || sim > prev) mejorPorFuncionario.set(item.funcionarioId, sim);
    }
    if (mejorPorFuncionario.size === 0) return { matched: false, reason: 'SIN_ROSTROS' };

    const ranking = [...mejorPorFuncionario.entries()].sort((a, b) => b[1] - a[1]);
    const [mejorFuncId, mejorSim] = ranking[0];
    const segundoSim = ranking.length > 1 ? ranking[1][1] : -1;

    if (mejorSim < umbral) {
      return { matched: false, reason: 'NO_MATCH', similitud: +mejorSim.toFixed(4) };
    }
    if (ranking.length > 1 && (mejorSim - segundoSim) < margenMin) {
      return { matched: false, reason: 'BAJO_MARGEN', similitud: +mejorSim.toFixed(4) };
    }

    const similitud = +mejorSim.toFixed(4);
    const funcionario = await dataSource.getRepository(Funcionario).findOne({
      where: { id: mejorFuncId },
      relations: ['persona'],
    });
    if (!funcionario) return { matched: false, reason: 'NO_MATCH', similitud };
    const nombre = `${(funcionario as any).persona?.nombre || ''} ${(funcionario as any).persona?.apellido || ''}`.trim();

    const ahora = new Date();
    const hoyStr = fechaYMD(ahora);
    const horaAhora = horaHHmm(ahora);
    const asistRepo = dataSource.getRepository(Asistencia);
    const existente = await asistRepo.findOne({
      where: { funcionario: { id: mejorFuncId }, fecha: parseLocalDate(hoyStr) as any },
      order: { createdAt: 'DESC' },
    });

    // Salida: ya hay entrada sin salida → cerrar
    if (existente && existente.horaEntrada && !existente.horaSalida) {
      existente.horaSalida = horaAhora;
      existente.horasTrabajadas = diffHoras(existente.horaEntrada, horaAhora);
      await asistRepo.save(existente);
      return {
        matched: true, tipo: 'SALIDA', similitud,
        funcionario: { id: mejorFuncId, nombre },
        asistenciaId: existente.id,
        horaEntrada: existente.horaEntrada, horaSalida: horaAhora,
        estado: existente.estado,
      };
    }

    // Ya fichó entrada y salida hoy
    if (existente && existente.horaEntrada && existente.horaSalida) {
      return {
        matched: true, tipo: 'YA_COMPLETO', similitud,
        funcionario: { id: mejorFuncId, nombre },
        asistenciaId: existente.id,
        horaEntrada: existente.horaEntrada, horaSalida: existente.horaSalida,
        estado: existente.estado,
      };
    }

    // Entrada: resolver turno vigente para calcular tardanza
    const ft = await dataSource.getRepository(FuncionarioTurno).findOne({
      where: { funcionario: { id: mejorFuncId }, fechaHasta: IsNull() },
      relations: ['turno'],
      order: { fechaDesde: 'DESC' },
    });
    const asistencia = await crearAsistenciaInterno(dataSource, getCurrentUser, {
      funcionarioId: mejorFuncId,
      turnoId: ft?.turno?.id,
      fecha: hoyStr,
      horaEntrada: horaAhora,
      metodoRegistro: 'FACIAL',
      similitudFacial: similitud,
    });
    return {
      matched: true, tipo: 'ENTRADA', similitud,
      funcionario: { id: mejorFuncId, nombre },
      asistenciaId: asistencia.id,
      horaEntrada: horaAhora,
      estado: asistencia.estado,
    };
  });
}

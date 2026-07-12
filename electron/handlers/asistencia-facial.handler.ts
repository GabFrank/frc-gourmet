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
import { RostroCacheItem, buildRostroCacheItem, elegirMejorMatch } from '../utils/face-match';

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
      const funcionarioId = (r.funcionario as any)?.id;
      if (!Array.isArray(vector) || !vector.length || !funcionarioId) return null;
      return buildRostroCacheItem(funcionarioId, vector, r.modelo);
    })
    .filter((x): x is RostroCacheItem => !!x);
  marcarCacheRostrosLimpio();
  return rostrosCache;
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

    // Liveness — autoritativo en el server usando los scores del cliente
    // (antispoof `real` + liveness `live` de Human), tunable por config.
    const livenessObligatorio = await getConfigBoolean(dataSource, 'FACIAL_LIVENESS_OBLIGATORIO', true);
    if (livenessObligatorio) {
      const livenessMin = await getConfigNumber(dataSource, 'FACIAL_LIVENESS_MIN', 0.5);
      const real = Number(payload?.real);
      const live = Number(payload?.live);
      const ok = Number.isFinite(real) && Number.isFinite(live) && real >= livenessMin && live >= livenessMin;
      if (!ok) return { matched: false, reason: 'LIVENESS' };
    }

    // Match 1:N (coseno) — mejor por funcionario + margen contra el 2º
    const umbral = await getConfigNumber(dataSource, 'FACIAL_UMBRAL_SIMILITUD', 0.6);
    const margenMin = await getConfigNumber(dataSource, 'FACIAL_MARGEN_MIN', 0.05);
    const cache = await getRostrosCache(dataSource);
    const match = elegirMejorMatch(query, cache, umbral, margenMin);
    if (!match.matched) return { matched: false, reason: match.reason, similitud: match.similitud };

    const mejorFuncId = match.funcionarioId!;
    const similitud = match.similitud;
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

    const funcData = { id: mejorFuncId, nombre };
    // `existente` es el registro más reciente del día. "Abierta" = con entrada sin salida.
    const abierta = !!(existente && existente.horaEntrada && !existente.horaSalida);
    const permitirMultiple = await getConfigBoolean(dataSource, 'FACIAL_PERMITIR_MULTIPLE_DIARIO', false);

    // Acción efectiva: la que pide el kiosco (ENTRADA/SALIDA) o auto-detección.
    const tipoPedido = payload?.tipo === 'ENTRADA' || payload?.tipo === 'SALIDA' ? payload.tipo : null;
    const accion: 'ENTRADA' | 'SALIDA' = tipoPedido || (abierta ? 'SALIDA' : 'ENTRADA');

    if (accion === 'SALIDA') {
      if (!abierta) {
        // No hay una entrada abierta que cerrar
        return { matched: true, tipo: 'SALIDA', sinEntrada: true, similitud, funcionario: funcData };
      }
      existente!.horaSalida = horaAhora;
      existente!.horasTrabajadas = diffHoras(existente!.horaEntrada!, horaAhora);
      await asistRepo.save(existente!);
      return {
        matched: true, tipo: 'SALIDA', similitud, funcionario: funcData,
        asistenciaId: existente!.id, horaEntrada: existente!.horaEntrada, horaSalida: horaAhora,
        estado: existente!.estado,
      };
    }

    // accion === 'ENTRADA'
    if (abierta) {
      // Ya tiene una entrada abierta → primero debe marcar salida
      return {
        matched: true, tipo: 'ENTRADA', yaRegistrado: true, similitud,
        funcionario: funcData, asistenciaId: existente!.id,
        horaEntrada: existente!.horaEntrada, estado: existente!.estado,
      };
    }
    if (existente && !permitirMultiple) {
      // Ya tiene un registro cerrado hoy y no se permiten marcas múltiples
      return {
        matched: true, tipo: 'YA_COMPLETO', yaRegistrado: true, similitud,
        funcionario: funcData, asistenciaId: existente!.id,
        horaEntrada: existente!.horaEntrada, horaSalida: existente!.horaSalida, estado: existente!.estado,
      };
    }
    // Crear nueva entrada (sin registro hoy, o múltiple habilitado con el anterior cerrado).
    // Resolver turno vigente para calcular tardanza:
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
      matched: true, tipo: 'ENTRADA', similitud, funcionario: funcData,
      asistenciaId: asistencia.id, horaEntrada: horaAhora, estado: asistencia.estado,
    };
  });
}

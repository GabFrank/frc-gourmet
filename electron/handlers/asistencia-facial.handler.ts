import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { FuncionarioRostro } from '../../src/app/database/entities/rrhh/funcionario-rostro.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';
import { deleteImageByUrl } from '../utils/image-resize.utils';

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
}

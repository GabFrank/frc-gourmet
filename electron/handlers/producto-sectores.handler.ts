/**
 * Handlers IPC para la M2M `Producto ↔ Sector` — declara en qué sectores
 * se imprime la comanda de cada producto.
 *
 * Usado por la UI Gestionar Producto y leído por `printComandaInternal`
 * para enrutar items multi-sector.
 *
 * Permisos: lectura libre (heredada del padre Productos); escritura
 * requiere `PRODUCTOS_GESTIONAR` (mismo permiso que `updateProducto`).
 */

import { ipcMain } from 'electron';
import { In, type DataSource } from 'typeorm';
import { ProductoSector } from '../../src/app/database/entities/productos/producto-sector.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';

type GetCurrentUser = () => Usuario | null;

export function registerProductoSectoresHandlers(
  dataSource: DataSource,
  getCurrentUser: GetCurrentUser,
) {

  // ─── GET BY PRODUCTO ────────────────────────────────────────────────────
  ipcMain.handle('get-producto-sectores', async (_event, productoId: number) => {
    try {
      const repo = dataSource.getRepository(ProductoSector);
      return await repo.find({
        where: { producto: { id: productoId } as any, activo: true },
        relations: ['sector'],
        order: { prioridad: 'ASC', id: 'ASC' },
      });
    } catch (error) {
      console.error('Error get-producto-sectores:', error);
      throw error;
    }
  });

  // ─── SET (replace) ──────────────────────────────────────────────────────
  // Reemplaza el conjunto de sectores del producto con la lista provista.
  // Atómico: agrega los nuevos, desactiva los que ya no están.
  ipcMain.handle('set-producto-sectores', async (_event, productoId: number, sectorIds: number[]) => {
    await ensurePermission(dataSource, getCurrentUser, 'PRODUCTOS_GESTIONAR');
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const repo = qr.manager.getRepository(ProductoSector);
      const userId = getCurrentUser()?.id;
      const targets = Array.isArray(sectorIds) ? Array.from(new Set(sectorIds.filter(n => Number.isFinite(n)))) : [];

      const existentes = await repo.find({
        where: { producto: { id: productoId } as any },
        relations: ['sector'],
      });

      const targetSet = new Set<number>(targets);
      const existentesMap = new Map<number, ProductoSector>();
      for (const ps of existentes) {
        const sid = (ps as any).sector?.id;
        if (sid != null) existentesMap.set(sid, ps);
      }

      // 1. Reactivar / dejar tal cual los que están en target
      // 2. Desactivar los que están pero no en target
      for (const ps of existentes) {
        const sid = (ps as any).sector?.id;
        if (sid == null) continue;
        const debeEstar = targetSet.has(sid);
        if (ps.activo !== debeEstar) {
          ps.activo = debeEstar;
          await setEntityUserTracking(dataSource, ps, userId, true);
          await repo.save(ps);
        }
      }

      // 3. Crear los nuevos (no estaban antes)
      for (const sid of targets) {
        if (existentesMap.has(sid)) continue;
        const entity = repo.create({
          producto: { id: productoId } as any,
          sector: { id: sid } as any,
          activo: true,
          prioridad: 0,
        });
        await setEntityUserTracking(dataSource, entity, userId, false);
        await repo.save(entity);
      }

      await qr.commitTransaction();

      return await dataSource.getRepository(ProductoSector).find({
        where: { producto: { id: productoId } as any, activo: true },
        relations: ['sector'],
        order: { prioridad: 'ASC', id: 'ASC' },
      });
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('Error set-producto-sectores:', error);
      throw error;
    } finally {
      await qr.release();
    }
  });
}

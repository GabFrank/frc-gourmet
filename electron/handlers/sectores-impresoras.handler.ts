/**
 * Handlers IPC para la M2M `Sector ↔ Printer` con rol — define a qué
 * impresora(s) van las comandas, tickets de venta y pre-cuentas de cada sector.
 *
 * Usado por la UI Sistema → "Sectores e impresoras" (E2.5) y leído por
 * `printComandaInternal` (E2.1) para resolver el routing multi-sector.
 *
 * Permisos: todos los CUD requieren `SECTORES_IMPRESORAS_CONFIGURAR`. La
 * lectura es libre (asume permiso del menú padre).
 */

import { ipcMain } from 'electron';
import type { DataSource } from 'typeorm';
import { SectorImpresora } from '../../src/app/database/entities/ventas/sector-impresora.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';

type GetCurrentUser = () => Usuario | null;

export function registerSectoresImpresorasHandlers(
  dataSource: DataSource,
  getCurrentUser: GetCurrentUser,
) {

  // ─── GET ALL ────────────────────────────────────────────────────────────
  ipcMain.handle('get-sectores-impresoras', async () => {
    try {
      const repo = dataSource.getRepository(SectorImpresora);
      return await repo.find({
        relations: ['sector', 'printer'],
        order: { id: 'ASC' },
      });
    } catch (error) {
      console.error('Error get-sectores-impresoras:', error);
      throw error;
    }
  });

  // ─── GET BY SECTOR ──────────────────────────────────────────────────────
  ipcMain.handle('get-sector-impresoras-by-sector', async (_event, sectorId: number) => {
    try {
      const repo = dataSource.getRepository(SectorImpresora);
      return await repo.find({
        where: { sector: { id: sectorId } as any },
        relations: ['printer', 'sector'],
        order: { id: 'ASC' },
      });
    } catch (error) {
      console.error('Error get-sector-impresoras-by-sector:', error);
      throw error;
    }
  });

  // ─── CREATE ─────────────────────────────────────────────────────────────
  ipcMain.handle('create-sector-impresora', async (_event, data: {
    sectorId: number;
    printerId: number;
    rol: string;
    activo?: boolean;
    observacion?: string;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, 'SECTORES_IMPRESORAS_CONFIGURAR');
    try {
      const repo = dataSource.getRepository(SectorImpresora);
      const currentUser = getCurrentUser();
      const entity = repo.create({
        sector: { id: data.sectorId } as any,
        printer: { id: data.printerId } as any,
        rol: data.rol as any,
        activo: data.activo !== false,
        observacion: data.observacion?.toUpperCase(),
      });
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      const saved = await repo.save(entity);
      // Re-fetch con relations
      return await repo.findOne({
        where: { id: saved.id },
        relations: ['sector', 'printer'],
      });
    } catch (error: any) {
      console.error('Error create-sector-impresora:', error);
      if (/UNIQUE|duplicate/i.test(error?.message || '')) {
        throw new Error('Esa combinación de Sector + Impresora + Rol ya existe');
      }
      throw error;
    }
  });

  // ─── UPDATE ─────────────────────────────────────────────────────────────
  ipcMain.handle('update-sector-impresora', async (_event, id: number, data: {
    sectorId?: number;
    printerId?: number;
    rol?: string;
    activo?: boolean;
    observacion?: string;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, 'SECTORES_IMPRESORAS_CONFIGURAR');
    try {
      const repo = dataSource.getRepository(SectorImpresora);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`SectorImpresora ${id} no encontrado`);
      if (data.sectorId != null) entity.sector = { id: data.sectorId } as any;
      if (data.printerId != null) entity.printer = { id: data.printerId } as any;
      if (data.rol != null) entity.rol = data.rol as any;
      if (data.activo != null) entity.activo = data.activo;
      if (data.observacion !== undefined) entity.observacion = data.observacion?.toUpperCase();
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      await repo.save(entity);
      return await repo.findOne({
        where: { id: entity.id },
        relations: ['sector', 'printer'],
      });
    } catch (error: any) {
      console.error('Error update-sector-impresora:', error);
      if (/UNIQUE|duplicate/i.test(error?.message || '')) {
        throw new Error('Esa combinación de Sector + Impresora + Rol ya existe');
      }
      throw error;
    }
  });

  // ─── DELETE ─────────────────────────────────────────────────────────────
  ipcMain.handle('delete-sector-impresora', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'SECTORES_IMPRESORAS_CONFIGURAR');
    try {
      const repo = dataSource.getRepository(SectorImpresora);
      const res = await repo.delete(id);
      return { success: (res.affected || 0) > 0 };
    } catch (error) {
      console.error('Error delete-sector-impresora:', error);
      throw error;
    }
  });
}

import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { DashboardShortcut } from '../../src/app/database/entities/personalizacion/dashboard-shortcut.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

export function registerDashboardShortcutsHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-dashboard-shortcuts', async (_event, dashboardKey?: string) => {
    try {
      const repo = dataSource.getRepository(DashboardShortcut);
      const qb = repo.createQueryBuilder('s')
        .where('s.activo = :activo', { activo: true })
        .orderBy('s.orden', 'ASC')
        .addOrderBy('s.id', 'ASC');
      if (dashboardKey) {
        qb.andWhere('s.dashboard_key = :dk', { dk: dashboardKey });
      }
      return await qb.getMany();
    } catch (error) {
      console.error('Error getting dashboard shortcuts:', error);
      throw error;
    }
  });

  ipcMain.handle('create-dashboard-shortcut', async (_event, data: any) => {
    try {
      const repo = dataSource.getRepository(DashboardShortcut);
      const entity = repo.create({
        dashboardKey: data.dashboardKey,
        titulo: data.titulo?.toUpperCase(),
        icono: data.icono || 'star',
        color: data.color || '#1976d2',
        targetType: data.targetType,
        targetData: data.targetData ? JSON.stringify(data.targetData) : null,
        orden: data.orden ?? 0,
        activo: true,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const result = await repo.save(entity);
      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      console.error('Error creating dashboard shortcut:', error);
      throw error;
    }
  });

  ipcMain.handle('update-dashboard-shortcut', async (_event, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(DashboardShortcut);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`DashboardShortcut ${id} no encontrado`);
      if (data.titulo !== undefined) existing.titulo = data.titulo?.toUpperCase();
      if (data.icono !== undefined) existing.icono = data.icono;
      if (data.color !== undefined) existing.color = data.color;
      if (data.orden !== undefined) existing.orden = data.orden;
      if (data.activo !== undefined) existing.activo = data.activo;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating dashboard shortcut ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-dashboard-shortcut', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(DashboardShortcut);
      await repo.delete(id);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting dashboard shortcut ${id}:`, error);
      throw error;
    }
  });
}

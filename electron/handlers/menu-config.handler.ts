import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { MenuConfig } from '../../src/app/database/entities/sistema/menu-config.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';

/**
 * Handlers de configuración del menú (overrides del ADMIN sobre `menu-tree.ts`).
 *
 * - `get-menu-config`: lectura (sin permiso — el frontend la necesita para
 *   armar el sidenav de cualquier usuario). Solo devuelve diferencias.
 * - `save-menu-config`: bulk upsert, requiere `SISTEMA_MENU_CONFIGURAR`.
 */
export function registerMenuConfigHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // Lectura: todos los overrides. Sin permiso — se aplica a cualquier usuario
  // para resolver su sidenav/buscador.
  ipcMain.handle('get-menu-config', async () => {
    try {
      const repo = dataSource.getRepository(MenuConfig);
      return await repo.find();
    } catch (error) {
      console.error('Error get-menu-config:', error);
      throw error;
    }
  });

  // Bulk upsert. `items`: [{ nodeId, enSidenav, enBuscador, orden }]. Una fila
  // sin ningún override (todo null) se elimina para no ensuciar la tabla.
  ipcMain.handle('save-menu-config', async (_event, items: any[]) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_MENU_CONFIGURAR');
      const repo = dataSource.getRepository(MenuConfig);
      const userId = getCurrentUser?.()?.id;
      const lista = Array.isArray(items) ? items : [];

      for (const raw of lista) {
        const nodeId = (raw?.nodeId || '').toString();
        if (!nodeId) continue;

        const enSidenav = normBool(raw.enSidenav);
        const enBuscador = normBool(raw.enBuscador);
        const orden = raw.orden === null || raw.orden === undefined || raw.orden === ''
          ? null
          : Number(raw.orden);

        let entity = await repo.findOne({ where: { nodeId } });

        // Sin ningún override → borrar la fila si existía.
        if (enSidenav === null && enBuscador === null && (orden === null || Number.isNaN(orden))) {
          if (entity) await repo.remove(entity);
          continue;
        }

        if (!entity) entity = repo.create({ nodeId });
        entity.enSidenav = enSidenav;
        entity.enBuscador = enBuscador;
        entity.orden = orden === null || Number.isNaN(orden) ? null : orden;

        await setEntityUserTracking(dataSource, entity, userId, !!entity.id);
        await repo.save(entity);
      }

      return { success: true };
    } catch (error) {
      console.error('Error save-menu-config:', error);
      throw error;
    }
  });
}

/** Normaliza a boolean o null (null = sin override). */
function normBool(v: any): boolean | null {
  if (v === true || v === false) return v;
  if (v === null || v === undefined || v === '') return null;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return null;
}

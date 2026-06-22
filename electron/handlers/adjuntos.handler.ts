import { ipcMain } from 'electron';
import type { DataSource } from 'typeorm';
import { Adjunto } from '../../src/app/database/entities/shared/adjunto.entity';
import type { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { deleteImageByUrl } from '../utils/image-resize.utils';
import { ensurePermission } from '../utils/auth.utils';
import { getPermisoAdjuntarPorTipo } from './documentos-permissions.config';

type GetCurrentUser = () => Usuario | null;

/**
 * IPCs genéricos para la entity polimórfica `Adjunto`. Toda entidad que necesite
 * adjuntar archivos (comprobantes, facturas, contratos, etc.) usa estos
 * handlers — no se crean handlers específicos por dominio.
 *
 * **Seguridad:**
 * - `create/update`: requiere `DOCUMENTOS_ADJUNTAR` + permiso del dominio
 *   (`getPermisoAdjuntarPorTipo` mappea entidadTipo → permiso).
 * - `delete`: requiere `DOCUMENTOS_ADJUNTOS_ELIMINAR` + permiso del dominio.
 * - `get-adjuntos` / `get-adjunto-by-id`: sin chequeo (asumimos que ya pasaste
 *   por el listado del dominio padre, que sí lo chequea).
 */
export function registerAdjuntosHandlers(dataSource: DataSource, getCurrentUser: GetCurrentUser) {
  ipcMain.handle('get-adjuntos', async (_event, params: { entidadTipo: string; entidadId: number; tipo?: string }) => {
    try {
      const repo = dataSource.getRepository(Adjunto);
      const where: any = {
        entidadTipo: params.entidadTipo.toUpperCase(),
        entidadId: params.entidadId,
      };
      if (params.tipo) where.tipo = params.tipo.toUpperCase();
      return await repo.find({ where, order: { createdAt: 'DESC' } });
    } catch (error) {
      console.error('Error getting adjuntos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-adjunto-by-id', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(Adjunto);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error('Error getting adjunto by id:', error);
      throw error;
    }
  });

  ipcMain.handle('create-adjunto', async (_event, data: {
    entidadTipo: string;
    entidadId: number;
    tipo?: string;
    archivoUrl: string;
    nombreArchivo: string;
    mimeType?: string;
    tamanoBytes?: number;
    observacion?: string;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, 'DOCUMENTOS_ADJUNTAR');
    const dominioPerm = getPermisoAdjuntarPorTipo(data.entidadTipo);
    if (dominioPerm) {
      await ensurePermission(dataSource, getCurrentUser, dominioPerm);
    }

    try {
      const repo = dataSource.getRepository(Adjunto);
      const currentUser = getCurrentUser();
      const adjunto = repo.create({
        entidadTipo: data.entidadTipo.toUpperCase(),
        entidadId: data.entidadId,
        tipo: (data.tipo ?? 'OTRO').toUpperCase(),
        archivoUrl: data.archivoUrl,
        nombreArchivo: data.nombreArchivo,
        mimeType: data.mimeType,
        tamanoBytes: data.tamanoBytes,
        observacion: data.observacion?.toUpperCase(),
      });
      await setEntityUserTracking(dataSource, adjunto, currentUser?.id, false);
      return await repo.save(adjunto);
    } catch (error) {
      console.error('Error creating adjunto:', error);
      throw error;
    }
  });

  ipcMain.handle('update-adjunto', async (_event, id: number, data: {
    tipo?: string;
    observacion?: string;
  }) => {
    await ensurePermission(dataSource, getCurrentUser, 'DOCUMENTOS_ADJUNTAR');

    try {
      const repo = dataSource.getRepository(Adjunto);
      const currentUser = getCurrentUser();
      const adjunto = await repo.findOneBy({ id });
      if (!adjunto) return { success: false, message: 'Adjunto not found' };

      const dominioPerm = getPermisoAdjuntarPorTipo(adjunto.entidadTipo);
      if (dominioPerm) {
        await ensurePermission(dataSource, getCurrentUser, dominioPerm);
      }

      if (data.tipo !== undefined) adjunto.tipo = data.tipo.toUpperCase();
      if (data.observacion !== undefined) adjunto.observacion = data.observacion?.toUpperCase();
      await setEntityUserTracking(dataSource, adjunto, currentUser?.id, true);
      return await repo.save(adjunto);
    } catch (error) {
      console.error('Error updating adjunto:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-adjunto', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'DOCUMENTOS_ADJUNTOS_ELIMINAR');

    try {
      const repo = dataSource.getRepository(Adjunto);
      const adjunto = await repo.findOneBy({ id });
      if (!adjunto) return { success: false, message: 'Adjunto not found' };

      const dominioPerm = getPermisoAdjuntarPorTipo(adjunto.entidadTipo);
      if (dominioPerm) {
        await ensurePermission(dataSource, getCurrentUser, dominioPerm);
      }

      // Borrar archivo del filesystem antes de remover la fila.
      // `deleteImageByUrl` funciona para cualquier archivo bajo `app://...`
      // (también intenta borrar derivatives `.thumb.jpg`/`.medium.jpg` —
      // no-op si no existen, no afecta PDFs).
      deleteImageByUrl(adjunto.archivoUrl);
      await repo.delete(id);
      return { success: true };
    } catch (error) {
      console.error('Error deleting adjunto:', error);
      throw error;
    }
  });
}

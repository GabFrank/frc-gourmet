import { ipcMain } from 'electron';
import type { DataSource } from 'typeorm';
import { Adjunto } from '../../src/app/database/entities/shared/adjunto.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { deleteImageByUrl } from '../utils/image-resize.utils';

type GetCurrentUser = () => { id?: number } | null | undefined;

/**
 * IPCs genéricos para la entity polimórfica `Adjunto`. Toda entidad que necesite
 * adjuntar archivos (comprobantes, facturas, contratos, etc.) usa estos
 * handlers — no se crean handlers específicos por dominio.
 */
export function registerAdjuntosHandlers(dataSource: DataSource, getCurrentUser: GetCurrentUser) {
  ipcMain.handle('get-adjuntos', async (_event, params: { entidadTipo: string; entidadId: number }) => {
    try {
      const repo = dataSource.getRepository(Adjunto);
      return await repo.find({
        where: {
          entidadTipo: params.entidadTipo,
          entidadId: params.entidadId,
        },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      console.error('Error getting adjuntos:', error);
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
    try {
      const repo = dataSource.getRepository(Adjunto);
      const currentUser = getCurrentUser();
      const adjunto = await repo.findOneBy({ id });
      if (!adjunto) return { success: false, message: 'Adjunto not found' };
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
    try {
      const repo = dataSource.getRepository(Adjunto);
      const adjunto = await repo.findOneBy({ id });
      if (!adjunto) return { success: false, message: 'Adjunto not found' };
      // Borrar archivo del filesystem antes de remover la fila.
      deleteImageByUrl(adjunto.archivoUrl);
      await repo.delete(id);
      return { success: true };
    } catch (error) {
      console.error('Error deleting adjunto:', error);
      throw error;
    }
  });
}

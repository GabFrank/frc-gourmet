import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource } from 'typeorm';
import * as imageHandler from '../utils/image-handler.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';

// Cualquier rol que administre entidades con foto puede subir/borrar imagen de perfil.
const IMG_PERMS = ['PERSONAS_GESTIONAR', 'CLIENTES_GESTIONAR', 'RRHH_FUNCIONARIO_EDITAR', 'USUARIOS_GESTIONAR'];

/**
 * Legacy IPC handlers para imágenes de perfil. Se mantienen por compat con
 * `create-edit-persona.component.ts`. Los nuevos consumidores deben usar el
 * `files.handler.ts` genérico (`save-file` / `delete-file`) que ya soporta
 * thumbnails automáticos.
 */
export function registerImageHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('save-profile-image', async (_event: IpcMainInvokeEvent, { base64Data, fileName }: { base64Data: string, fileName: string }) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, IMG_PERMS);
      return await imageHandler.saveProfileImage(base64Data, fileName);
    } catch (error) {
      console.error('Error saving profile image via IPC:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-profile-image', async (_event: IpcMainInvokeEvent, imageUrl: string) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, IMG_PERMS);
      const success = await imageHandler.deleteProfileImage(imageUrl);
      return { success };
    } catch (error) {
      console.error('Error deleting profile image via IPC:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { getFaceModelsStatus, downloadFaceModels } from '../utils/face-models.utils';
import { ensurePairingServer } from '../server/pairing';

/**
 * Handlers de gestión de modelos faciales: estado, descarga in-app (con progreso)
 * y resolución de la URL base para servirlos por HTTP (para el enrollment desktop).
 */
export function registerFaceModelsHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
): void {
  // Estado de instalación (solo lectura, sin permiso)
  ipcMain.handle('get-face-models-status', async () => {
    return getFaceModelsStatus();
  });

  // Descargar modelos (con progreso por IPC event)
  ipcMain.handle('download-face-models', async (event) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const status = await downloadFaceModels((p) => {
      try { event.sender.send('face-models-progress', p); } catch { /* ventana cerrada */ }
    });
    return status;
  });

  // URL base para cargar los modelos por HTTP desde el desktop (asegura el server).
  ipcMain.handle('get-face-models-base-url', async () => {
    const info = await ensurePairingServer(dataSource);
    return { baseUrl: `http://127.0.0.1:${info.port}/face-models` };
  });
}

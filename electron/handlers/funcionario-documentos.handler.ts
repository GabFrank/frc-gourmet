import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { FuncionarioDocumento } from '../../src/app/database/entities/rrhh/funcionario-documento.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import {
  saveFuncionarioDocumento,
  deleteFuncionarioDocumento,
  readFuncionarioDocumentoBase64,
} from '../utils/document-handler.utils';

/**
 * Convierte una `rutaRelativa` (ej `funcionario-documentos/3/contrato.pdf`) en
 * una URL `app://...` consumible directamente por `<img>`, `<a href>` o el
 * visor de documentos. Compatible con datos legacy.
 */
function toArchivoUrl(rutaRelativa: string | null | undefined): string | undefined {
  if (!rutaRelativa) return undefined;
  if (rutaRelativa.startsWith('app://')) return rutaRelativa;
  return `app://${rutaRelativa}`;
}

function decorateDocumento<T extends { rutaRelativa?: string }>(doc: T | null): T & { archivoUrl?: string } | null {
  if (!doc) return null;
  return { ...doc, archivoUrl: toArchivoUrl(doc.rutaRelativa) };
}

export function registerFuncionarioDocumentosHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-funcionario-documentos', async (_event, funcionarioId: number) => {
    try {
      const repo = dataSource.getRepository(FuncionarioDocumento);
      const docs = await repo.find({
        where: { funcionario: { id: funcionarioId } as any },
        order: { fechaSubida: 'DESC' },
      });
      return docs.map(d => decorateDocumento(d));
    } catch (error) {
      console.error(`Error getting documentos del funcionario ${funcionarioId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('upload-funcionario-documento', async (_event, payload: any) => {
    try {
      const { funcionarioId, tipo, nombreArchivo, mimeType, base64, vencimiento, observacion } = payload || {};
      if (!funcionarioId || !nombreArchivo || !base64) {
        throw new Error('Datos incompletos para subir el documento');
      }
      const funcionario = await dataSource
        .getRepository(Funcionario)
        .findOne({ where: { id: funcionarioId } });
      if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);

      const meta = saveFuncionarioDocumento(funcionarioId, base64, nombreArchivo, mimeType);

      const repo = dataSource.getRepository(FuncionarioDocumento);
      const entity = repo.create({
        funcionario,
        tipo: tipo || 'OTRO',
        nombreArchivo,
        rutaRelativa: meta.rutaRelativa,
        mimeType: meta.mimeType,
        tamanoBytes: meta.tamanoBytes,
        fechaSubida: new Date(),
        vencimiento: vencimiento || undefined,
        observacion,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const saved = await repo.save(entity);
      return decorateDocumento(saved);
    } catch (error) {
      console.error('Error subiendo documento del funcionario:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-funcionario-documento', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(FuncionarioDocumento);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) return { success: false, message: 'Documento no encontrado' };
      deleteFuncionarioDocumento(existing.rutaRelativa);
      await repo.delete(id);
      return { success: true };
    } catch (error) {
      console.error(`Error eliminando documento ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-funcionario-documento-base64', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(FuncionarioDocumento);
      const doc = await repo.findOne({ where: { id } });
      if (!doc) return null;
      const base64 = readFuncionarioDocumentoBase64(doc.rutaRelativa);
      return { ...doc, base64 };
    } catch (error) {
      console.error(`Error leyendo documento ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('update-funcionario-documento', async (_event, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(FuncionarioDocumento);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`Documento ${id} no encontrado`);
      if (data.tipo !== undefined) existing.tipo = data.tipo;
      if (data.vencimiento !== undefined) existing.vencimiento = data.vencimiento ?? undefined;
      if (data.observacion !== undefined) existing.observacion = data.observacion;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error actualizando documento ${id}:`, error);
      throw error;
    }
  });
}

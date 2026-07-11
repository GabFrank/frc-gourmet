import { app, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { deleteImageDerivatives } from '../utils/image-resize.utils';
import {
  ALLOWED_CARPETAS,
  SaveFileInput,
  SaveFileResult,
  inferMimeType,
  saveFileToBucket,
} from '../utils/file-save.utils';

function carpetaFromUrl(url: string): { carpeta: string; relPath: string } | null {
  if (!url.startsWith('app://')) return null;
  const rest = url.replace(/^app:\/\//, '');
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const carpeta = rest.substring(0, slash);
  const relPath = rest.substring(slash + 1);
  return { carpeta, relPath };
}

function urlToAbsolute(url: string): string | null {
  const parsed = carpetaFromUrl(url);
  if (!parsed) return null;
  // Allow nested subpaths under known buckets (funcionario-documentos/{id}/<file>).
  const top = parsed.carpeta.split('/')[0];
  if (!ALLOWED_CARPETAS.has(top)) return null;
  return path.join(app.getPath('userData'), parsed.carpeta, parsed.relPath);
}

export function registerFilesHandlers(): void {

  ipcMain.handle('save-file', async (_event, input: SaveFileInput): Promise<SaveFileResult> => {
    // Lógica compartida con la ruta Fastify de subida por QR (file-save.utils).
    return saveFileToBucket(input);
  });

  ipcMain.handle('delete-file', async (_event, input: { url: string }): Promise<{ ok: boolean }> => {
    const abs = urlToAbsolute(input.url);
    if (!abs) return { ok: false };
    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
      // Best effort: also remove derivatives if present.
      deleteImageDerivatives(abs);
      return { ok: true };
    } catch (err) {
      console.warn('delete-file failed:', input.url, err);
      return { ok: false };
    }
  });

  ipcMain.handle('read-file-base64', async (_event, input: { url: string }): Promise<{ base64: string; mimeType: string }> => {
    const abs = urlToAbsolute(input.url);
    if (!abs || !fs.existsSync(abs)) {
      throw new Error(`read-file-base64: archivo no encontrado: ${input.url}`);
    }
    const buf = fs.readFileSync(abs);
    return {
      base64: buf.toString('base64'),
      mimeType: inferMimeType(abs),
    };
  });

  ipcMain.handle('open-file-with-system', async (_event, input: { url: string }): Promise<{ ok: boolean; error?: string }> => {
    const abs = urlToAbsolute(input.url);
    if (!abs || !fs.existsSync(abs)) {
      return { ok: false, error: 'archivo no encontrado' };
    }
    const error = await shell.openPath(abs);
    if (error) return { ok: false, error };
    return { ok: true };
  });

  // Abre un archivo generado en memoria (base64) en el visor por defecto del SO.
  // Lo escribe a userData/temp/ y lo abre con shell.openPath. Usado para abrir
  // PDFs/reportes recién generados sin que el usuario tenga que buscarlos.
  ipcMain.handle('open-base64-file', async (_event, input: { base64: string; fileName: string }): Promise<{ ok: boolean; error?: string }> => {
    try {
      if (!input?.base64) return { ok: false, error: 'sin contenido' };
      const dir = path.join(app.getPath('userData'), 'temp');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Sanitizar nombre y garantizar unicidad (timestamp) para no pisar visores abiertos.
      const safeName = (input.fileName || 'documento.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      const absPath = path.join(dir, `${Date.now()}_${safeName}`);
      fs.writeFileSync(absPath, Buffer.from(input.base64, 'base64'));
      const error = await shell.openPath(absPath);
      if (error) return { ok: false, error };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });
}

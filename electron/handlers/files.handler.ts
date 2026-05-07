import { app, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { generateImageDerivatives, deleteImageDerivatives } from '../utils/image-resize.utils';

// Allowed top-level buckets under userData/. Any IPC trying to escape this
// list (or use ../) is rejected.
const ALLOWED_CARPETAS = new Set([
  'profile-images',
  'producto-images',
  'funcionario-documentos',
  'factura-imports',
  'adjuntos',
]);

interface SaveFileInput {
  carpeta: string;
  base64: string;
  fileName: string;
  generateThumbnails?: boolean;
}

interface SaveFileResult {
  url: string;
  fileName: string;
  mimeType: string;
  tamanoBytes: number;
  thumbUrl?: string;
  mediumUrl?: string;
}

function sanitizeFileName(name: string): string {
  // Remove path separators and control chars, keep extension.
  const cleaned = name.replace(/[\\/]/g, '_').replace(/[\x00-\x1f]/g, '');
  return cleaned.length > 0 ? cleaned : 'file';
}

function uniqueFileName(dir: string, fileName: string): string {
  if (!fs.existsSync(path.join(dir, fileName))) return fileName;
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  const ts = Date.now();
  return `${base}.${ts}${ext}`;
}

function inferMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.pdf': return 'application/pdf';
    case '.txt': return 'text/plain';
    case '.csv': return 'text/csv';
    case '.json': return 'application/json';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.doc': return 'application/msword';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls': return 'application/vnd.ms-excel';
    case '.zip': return 'application/zip';
    default: return 'application/octet-stream';
  }
}

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
    const { carpeta, base64, fileName, generateThumbnails } = input;

    if (!ALLOWED_CARPETAS.has(carpeta)) {
      throw new Error(`save-file: carpeta '${carpeta}' no permitida`);
    }
    const safeName = sanitizeFileName(fileName);
    const dir = path.join(app.getPath('userData'), carpeta);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const finalName = uniqueFileName(dir, safeName);
    const absPath = path.join(dir, finalName);

    // Strip data: prefix if present.
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(absPath, buffer);

    const mimeType = inferMimeType(finalName);
    const url = `app://${carpeta}/${finalName}`;

    const result: SaveFileResult = {
      url,
      fileName: finalName,
      mimeType,
      tamanoBytes: buffer.length,
    };

    // Thumbnails for images by default. Caller can opt out.
    const wantThumbs = generateThumbnails !== false && mimeType.startsWith('image/');
    if (wantThumbs) {
      const derivs = await generateImageDerivatives(absPath);
      if (derivs.thumbCreated) {
        result.thumbUrl = url.replace(/(\.[^./]+)$/, '.thumb.jpg');
      }
      if (derivs.mediumCreated) {
        result.mediumUrl = url.replace(/(\.[^./]+)$/, '.medium.jpg');
      }
    }

    return result;
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
}

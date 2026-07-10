import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { generateImageDerivatives } from './image-resize.utils';

/**
 * Util compartido de guardado de archivos a `userData/<carpeta>/`.
 *
 * Extraído del handler IPC `save-file` (`electron/handlers/files.handler.ts`)
 * para que la misma lógica (allowlist de buckets, nombre estandarizado,
 * derivadas thumbnail/medium, path-safety) la reutilicen tanto ese handler
 * como la ruta Fastify de subida por QR (`electron/server/qr-upload-routes.ts`).
 *
 * Regla del proyecto: cualquier bucket nuevo debe agregarse acá (fuente única)
 * y quedar reflejado en `main.ts:registerAppProtocol()` (knownBuckets) y en
 * `electron/server/file-routes.ts`.
 */

// Buckets permitidos bajo userData/. Unión reconciliada de los allowlists que
// antes vivían por separado en files.handler.ts, file-routes.ts y main.ts.
export const ALLOWED_CARPETAS = new Set<string>([
  'profile-images',
  'producto-images',
  'producto-thumbs',
  'sabores',
  'presentaciones',
  'funcionario-documentos',
  'factura-imports',
  'adjuntos',
  'logos',
]);

// Prefijo corto por bucket — identifica el dominio sin ambigüedad en el filesystem.
const BUCKET_PREFIX: Record<string, string> = {
  'profile-images': 'pers',
  'producto-images': 'prod',
  'producto-thumbs': 'prodt',
  'sabores': 'sabor',
  'presentaciones': 'pres',
  'funcionario-documentos': 'func',
  'factura-imports': 'fact',
  'adjuntos': 'adj',
  'logos': 'logo',
};

export interface SaveFileInput {
  carpeta: string;
  base64: string;
  fileName: string;
  generateThumbnails?: boolean;
}

export interface SaveFileResult {
  url: string;
  fileName: string;
  mimeType: string;
  tamanoBytes: number;
  thumbUrl?: string;
  mediumUrl?: string;
}

export function isCarpetaPermitida(carpeta: string): boolean {
  if (!carpeta) return false;
  const top = carpeta.split('/')[0];
  return ALLOWED_CARPETAS.has(top);
}

function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  // Sólo permitir extensiones razonables; default a .bin si no hay.
  if (!ext || !/^\.[a-z0-9]{1,8}$/i.test(ext)) return '.bin';
  return ext;
}

/**
 * Genera nombre estandarizado: `<prefix>-<timestamp>-<random>.<ext>`. Descarta
 * el nombre original del usuario — el nombre original se preserva en BD
 * (`nombreArchivo`) y es lo que ve el usuario en la UI. En disco nos importa
 * unicidad, ordenamiento cronológico y trazabilidad por bucket.
 */
export function generateStandardFileName(carpeta: string, originalName: string): string {
  const top = carpeta.split('/')[0];
  const prefix = BUCKET_PREFIX[top] ?? 'file';
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 5); // 3 chars
  return `${prefix}-${ts}-${rand}${safeExtension(originalName)}`;
}

export function inferMimeType(fileName: string): string {
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

/**
 * Guarda un archivo base64 en `userData/<carpeta>/` con nombre estandarizado.
 * Valida el bucket contra `ALLOWED_CARPETAS` y genera derivadas thumbnail/medium
 * para imágenes (salvo `generateThumbnails === false`). Devuelve la `app://` URL
 * y metadatos para persistir en BD. Lanza si la carpeta no está permitida.
 */
export async function saveFileToBucket(input: SaveFileInput): Promise<SaveFileResult> {
  const { carpeta, base64, fileName, generateThumbnails } = input;

  if (!isCarpetaPermitida(carpeta)) {
    throw new Error(`save-file: carpeta '${carpeta}' no permitida`);
  }
  const dir = path.join(app.getPath('userData'), carpeta);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Nombre estandarizado en disco: `<prefix>-<ts>-<rand>.<ext>`.
  // El nombre original (`fileName`) sólo se devuelve en `result.fileName`
  // para que el caller lo persista en la columna `nombreArchivo` de la BD.
  let finalName = generateStandardFileName(carpeta, fileName);
  while (fs.existsSync(path.join(dir, finalName))) {
    finalName = generateStandardFileName(carpeta, fileName); // colisión astronómicamente improbable
  }
  const absPath = path.join(dir, finalName);

  // Strip data: prefix if present.
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  fs.writeFileSync(absPath, buffer);

  const mimeType = inferMimeType(finalName);
  const url = `app://${carpeta}/${finalName}`;

  const result: SaveFileResult = {
    url,
    fileName: fileName, // ← devolvemos el nombre original (lo que verá el usuario)
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
}

import * as crypto from 'crypto';
import type { SaveFileResult } from '../utils/file-save.utils';

/**
 * Store en memoria de las sesiones de emparejamiento QR → subida mobile.
 *
 * Flujo: el desktop crea una sesión (carpeta destino + límites) y muestra un QR
 * que apunta a `<serverUrl>/m/upload?session=<id>`. El celular abre la PWA,
 * sube un archivo vía `POST /api/qr-upload/:id` y el archivo queda registrado
 * acá. El widget del desktop hace polling (`qr-upload-poll`) hasta recibirlo.
 *
 * El `sessionId` ES la credencial: aleatorio, de vida corta y con carpeta fija.
 * El celular nunca toca la BD — sólo escribe un archivo a disco y devuelve su
 * `app://` URL; la asociación a la entidad la hace el desktop al guardar el form.
 */

export interface QrUploadSession {
  id: string;
  carpeta: string;
  accept: string;
  maxSizeMB: number;
  files: SaveFileResult[];
  createdAt: number;
  expiresAt: number;
}

// Vida de una sesión antes de expirar (10 min). Suficiente para que el usuario
// tome el celular, escanee y suba, sin dejar tokens válidos indefinidamente.
const SESSION_TTL_MS = 10 * 60 * 1000;

const sessions = new Map<string, QrUploadSession>();

let cleanupTimer: NodeJS.Timeout | null = null;

function ensureCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (s.expiresAt <= now) sessions.delete(id);
    }
    if (sessions.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, 60 * 1000);
  // No mantener vivo el proceso sólo por este timer.
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

export function createQrUploadSession(opts: {
  carpeta: string;
  accept?: string;
  maxSizeMB?: number;
}): QrUploadSession {
  const id = crypto.randomBytes(18).toString('base64url'); // ~24 chars, url-safe
  const now = Date.now();
  const session: QrUploadSession = {
    id,
    carpeta: opts.carpeta,
    accept: opts.accept || 'image/*,application/pdf',
    maxSizeMB: opts.maxSizeMB || 15,
    files: [],
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  sessions.set(id, session);
  ensureCleanupTimer();
  return session;
}

/** Devuelve la sesión si existe y no expiró; si expiró la elimina y devuelve null. */
export function getQrUploadSession(id: string): QrUploadSession | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return s;
}

/** Registra un archivo subido contra una sesión. Devuelve false si la sesión no es válida. */
export function addFileToSession(id: string, file: SaveFileResult): boolean {
  const s = getQrUploadSession(id);
  if (!s) return false;
  s.files.push(file);
  return true;
}

export function closeQrUploadSession(id: string): void {
  sessions.delete(id);
}

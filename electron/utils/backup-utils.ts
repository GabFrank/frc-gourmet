import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { readAppSettings, updateAppSettings, BackupSettings } from './app-settings.utils';

export interface BackupMetadata {
  fileName: string;
  fullPath: string;
  size: number;
  createdAt: Date;
  isAutomatic: boolean;
  hash?: string;
  hasImages?: boolean;
  appVersion?: string;
  notes?: string;
}

export type BackupMode = 'interval' | 'daily';

export interface BackupConfig {
  autoBackupEnabled: boolean;
  /** 'daily' = una vez por día (default); 'interval' = cada N horas desde el arranque. */
  mode: BackupMode;
  intervalHours: number;
  /**
   * Hora fija del backup diario en formato 'HH:MM' (local). Vacío/undefined =
   * se hace al abrir la app la primera vez de cada día. Solo aplica a mode='daily'.
   */
  dailyTime?: string;
  retentionCount: number;
  customBackupDir?: string;
  includeImages: boolean;
  lastAutoBackupAt?: string;
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  autoBackupEnabled: false,
  mode: 'daily',
  intervalHours: 24,
  dailyTime: undefined,
  retentionCount: 7,
  customBackupDir: undefined,
  includeImages: false,
  lastAutoBackupAt: undefined,
};

const LEGACY_CONFIG_FILE_NAME = 'backup-config.json';
const BACKUP_PREFIX = 'frc-gourmet-backup';

export function getBackupDir(userDataPath: string, override?: string): string {
  const dir = override && override.trim() ? override : path.join(userDataPath, 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getDbPath(userDataPath: string): string {
  return path.join(userDataPath, 'frc-gourmet.db');
}

export function getProfileImagesPath(userDataPath: string): string {
  return path.join(userDataPath, 'profile-images');
}

export function getProductoImagesPath(userDataPath: string): string {
  return path.join(userDataPath, 'producto-images');
}

function migrateLegacyBackupConfig(userDataPath: string): void {
  const legacyPath = path.join(userDataPath, LEGACY_CONFIG_FILE_NAME);
  if (!fs.existsSync(legacyPath)) return;
  try {
    const raw = fs.readFileSync(legacyPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BackupConfig>;
    updateAppSettings(userDataPath, (s) => ({
      ...s,
      backup: { ...s.backup, ...(parsed as BackupSettings) },
    }));
    fs.unlinkSync(legacyPath);
    console.log('[backup-utils] backup-config.json migrado a app-settings.json y eliminado.');
  } catch (e) {
    console.warn('[backup-utils] error migrando backup-config legacy:', e);
  }
}

export function readBackupConfig(userDataPath: string): BackupConfig {
  migrateLegacyBackupConfig(userDataPath);
  const settings = readAppSettings(userDataPath);
  return { ...DEFAULT_BACKUP_CONFIG, ...settings.backup };
}

export function writeBackupConfig(userDataPath: string, config: BackupConfig): void {
  updateAppSettings(userDataPath, (s) => ({
    ...s,
    backup: { ...s.backup, ...config },
  }));
}

export function timestampSlug(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function buildBackupFileName(opts: { withImages: boolean; isAutomatic: boolean; date?: Date }): string {
  const slug = timestampSlug(opts.date);
  const tag = opts.isAutomatic ? 'auto' : 'manual';
  const ext = opts.withImages ? 'frcbak' : 'db';
  return `${BACKUP_PREFIX}_${tag}_${slug}.${ext}`;
}

export function fileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

export function listBackupsInDir(dir: string): BackupMetadata[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result: BackupMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith(BACKUP_PREFIX)) continue;
    const full = path.join(dir, entry.name);
    const stat = fs.statSync(full);
    const isAutomatic = entry.name.includes('_auto_');
    const hasImages = entry.name.endsWith('.frcbak');
    result.push({
      fileName: entry.name,
      fullPath: full,
      size: stat.size,
      createdAt: stat.mtime,
      isAutomatic,
      hasImages,
    });
  }
  return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

export function rmDirRecursive(dir: string): void {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Empaqueta un backup completo (db + imagenes) en un directorio temporal
 * y lo serializa como un .frcbak (zip-like) usando JSON manifest + concat.
 *
 * Para evitar dependencias nuevas, usamos un formato propio simple:
 *   - Header JSON (length-prefixed) con manifest de archivos
 *   - Body: concatenacion de bytes de cada archivo segun manifest
 *
 * Estructura:
 *   [4 bytes BE manifestLen][manifestJSON UTF-8][file1 bytes][file2 bytes]...
 */
export interface FrcBakManifest {
  version: number;
  createdAt: string;
  appVersion?: string;
  notes?: string;
  dbHash: string;
  files: { relPath: string; size: number; sha256: string }[];
}

export function packFrcBak(opts: {
  outFile: string;
  dbPath: string;
  imagesDirs: { relRoot: string; absDir: string }[];
  appVersion?: string;
  notes?: string;
}): { manifest: FrcBakManifest; size: number } {
  const filesToInclude: { relPath: string; absPath: string }[] = [];

  filesToInclude.push({ relPath: 'frc-gourmet.db', absPath: opts.dbPath });

  for (const imgDir of opts.imagesDirs) {
    if (!fs.existsSync(imgDir.absDir)) continue;
    const stack: string[] = [imgDir.absDir];
    while (stack.length) {
      const cur = stack.pop()!;
      const entries = fs.readdirSync(cur, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(cur, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          const rel = path.posix.join(imgDir.relRoot, path.relative(imgDir.absDir, full).split(path.sep).join('/'));
          filesToInclude.push({ relPath: rel, absPath: full });
        }
      }
    }
  }

  const manifest: FrcBakManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: opts.appVersion,
    notes: opts.notes,
    dbHash: fileSha256(opts.dbPath),
    files: filesToInclude.map(f => ({
      relPath: f.relPath,
      size: fs.statSync(f.absPath).size,
      sha256: fileSha256(f.absPath),
    })),
  };

  const manifestJson = Buffer.from(JSON.stringify(manifest), 'utf-8');
  const manifestLenBuf = Buffer.alloc(4);
  manifestLenBuf.writeUInt32BE(manifestJson.length, 0);

  const out = fs.openSync(opts.outFile, 'w');
  try {
    fs.writeSync(out, manifestLenBuf, 0, 4);
    fs.writeSync(out, manifestJson, 0, manifestJson.length);
    for (const f of filesToInclude) {
      const fd = fs.openSync(f.absPath, 'r');
      try {
        const stat = fs.fstatSync(fd);
        const buf = Buffer.alloc(64 * 1024);
        let read = 0;
        let total = 0;
        while ((read = fs.readSync(fd, buf, 0, buf.length, total)) > 0) {
          fs.writeSync(out, buf, 0, read);
          total += read;
        }
        if (total !== stat.size) {
          throw new Error(`Tamaño leido (${total}) no coincide con stat (${stat.size}) en ${f.absPath}`);
        }
      } finally {
        fs.closeSync(fd);
      }
    }
  } finally {
    fs.closeSync(out);
  }

  return { manifest, size: fs.statSync(opts.outFile).size };
}

export function readFrcBakManifest(filePath: string): FrcBakManifest {
  const fd = fs.openSync(filePath, 'r');
  try {
    const lenBuf = Buffer.alloc(4);
    fs.readSync(fd, lenBuf, 0, 4, 0);
    const len = lenBuf.readUInt32BE(0);
    if (len <= 0 || len > 10 * 1024 * 1024) {
      throw new Error('Manifest length invalido en .frcbak');
    }
    const manifestBuf = Buffer.alloc(len);
    fs.readSync(fd, manifestBuf, 0, len, 4);
    return JSON.parse(manifestBuf.toString('utf-8'));
  } finally {
    fs.closeSync(fd);
  }
}

export function unpackFrcBak(opts: { srcFile: string; targetUserDataPath: string }): { manifest: FrcBakManifest } {
  const fd = fs.openSync(opts.srcFile, 'r');
  try {
    const lenBuf = Buffer.alloc(4);
    fs.readSync(fd, lenBuf, 0, 4, 0);
    const len = lenBuf.readUInt32BE(0);
    const manifestBuf = Buffer.alloc(len);
    fs.readSync(fd, manifestBuf, 0, len, 4);
    const manifest: FrcBakManifest = JSON.parse(manifestBuf.toString('utf-8'));

    let offset = 4 + len;
    const buf = Buffer.alloc(64 * 1024);

    for (const file of manifest.files) {
      const targetAbs = path.join(opts.targetUserDataPath, file.relPath);
      const targetDir = path.dirname(targetAbs);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const outFd = fs.openSync(targetAbs, 'w');
      try {
        let remaining = file.size;
        let writePos = 0;
        while (remaining > 0) {
          const toRead = Math.min(buf.length, remaining);
          const read = fs.readSync(fd, buf, 0, toRead, offset);
          if (read <= 0) throw new Error('EOF inesperado en .frcbak');
          fs.writeSync(outFd, buf, 0, read, writePos);
          offset += read;
          writePos += read;
          remaining -= read;
        }
      } finally {
        fs.closeSync(outFd);
      }
    }
    return { manifest };
  } finally {
    fs.closeSync(fd);
  }
}

export function isFrcBakFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.frcbak');
}

export function isDbFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.db');
}

export function validateSqliteFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < 100) return false;
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(16);
      fs.readSync(fd, buf, 0, 16, 0);
      const header = buf.toString('utf-8', 0, 15);
      return header === 'SQLite format 3';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

// ===================== SCHEDULING DIARIO + CATCH-UP =====================

/** Día local en formato YYYY-MM-DD (sin componente horario ni UTC). */
export function localDayStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parsea 'HH:MM' a {h, m}. Devuelve null si está vacío o es inválido. */
export function parseDailyTime(time?: string): { h: number; m: number } | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/**
 * ¿Falta el backup diario? true si el último backup automático NO es de hoy y,
 * cuando hay hora fija configurada, esa hora ya pasó. Cubre el caso de la PC
 * apagada a la hora programada: al iniciar la app se detecta el día perdido y
 * se ejecuta el backup pendiente.
 */
export function shouldRunDailyBackup(now: Date, lastAutoBackupAt: string | undefined, dailyTime?: string): boolean {
  const lastDay = lastAutoBackupAt ? localDayStr(new Date(lastAutoBackupAt)) : null;
  if (lastDay === localDayStr(now)) return false;
  const t = parseDailyTime(dailyTime);
  if (!t) return true; // sin hora fija: primer arranque del día
  const scheduledToday = new Date(now);
  scheduledToday.setHours(t.h, t.m, 0, 0);
  return now.getTime() >= scheduledToday.getTime();
}

/**
 * Próxima ejecución del backup diario. Con hora fija: la próxima ocurrencia de
 * esa hora (hoy si todavía no pasó, sino mañana). Sin hora fija: el próximo
 * inicio de día local (00:00 de mañana), que cubre la app dejada abierta a
 * través de la medianoche.
 */
export function nextDailyRunAt(now: Date, dailyTime?: string): Date {
  const t = parseDailyTime(dailyTime);
  const next = new Date(now);
  if (t) {
    next.setHours(t.h, t.m, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  } else {
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function applyRetention(dir: string, keepCount: number): { deleted: string[] } {
  if (keepCount <= 0) return { deleted: [] };
  const all = listBackupsInDir(dir).filter(b => b.isAutomatic);
  if (all.length <= keepCount) return { deleted: [] };
  const toDelete = all.slice(keepCount);
  const deleted: string[] = [];
  for (const b of toDelete) {
    try {
      fs.unlinkSync(b.fullPath);
      deleted.push(b.fileName);
    } catch (e) {
      console.warn('No se pudo borrar backup automatico:', b.fileName, e);
    }
  }
  return { deleted };
}

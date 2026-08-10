import { app, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { DatabaseService } from '../../src/app/database/database.service';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { readAppSettings } from '../utils/app-settings.utils';
import { getDbPassword } from '../utils/db-password.utils';
import {
  BackupConfig,
  BackupMetadata,
  applyRetention,
  buildBackupFileName,
  dirSize,
  fileSha256,
  frcBakDbFileName,
  getBackupDir,
  getDbPath,
  getDbType,
  getProductoImagesPath,
  getProfileImagesPath,
  isDbFile,
  isFrcBakFile,
  listBackupsInDir,
  nextDailyRunAt,
  packFrcBak,
  pruneSafetyBackups,
  readBackupConfig,
  readFrcBakManifest,
  rmDirRecursive,
  shouldRunDailyBackup,
  unpackFrcBak,
  validateSqliteFile,
  writeBackupConfig,
} from '../utils/backup-utils';
import {
  PgConnInfo,
  PgFormat,
  getPgDatabaseSize,
  pgDump,
  pgDumpExtension,
  pgFormatFromFile,
  pgPing,
  pgResetSchema,
  pgRestore,
} from '../utils/pg-backup.utils';
import { buildEvolutionConfig } from '../services/notificacion.service';
import { getEvolutionApiKey } from '../utils/notificaciones-secrets.util';
import { sendWhatsappDocumentFile, normalizeWhatsappNumber } from '../services/whatsapp.service';

let autoBackupInterval: NodeJS.Timeout | null = null;
let autoBackupTimeout: NodeJS.Timeout | null = null;
let nextAutoBackupAt: Date | null = null;

/** Tope de tamaño para envío por WhatsApp (base64 en JSON => cuidado con la RAM). */
const WHATSAPP_MAX_BYTES = 100 * 1024 * 1024;

interface CreateBackupResult {
  success: boolean;
  fileName?: string;
  fullPath?: string;
  size?: number;
  hash?: string;
  hasImages?: boolean;
  message?: string;
}

/** Directorios de imágenes que van dentro de un backup completo (.frcbak). */
function imagesDirs(userDataPath: string) {
  return [
    { relRoot: 'profile-images', absDir: getProfileImagesPath(userDataPath) },
    { relRoot: 'producto-images', absDir: getProductoImagesPath(userDataPath) },
  ];
}

/** Resuelve la conexión Postgres desde app-settings + keytar (password). */
async function getPgConn(userDataPath: string): Promise<PgConnInfo> {
  const db = readAppSettings(userDataPath).database;
  const password = await getDbPassword();
  return {
    host: db.host || 'localhost',
    port: db.port || 5432,
    database: db.database || 'frc_gourmet',
    username: db.username || 'postgres',
    password,
    ssl: !!db.ssl,
    schema: db.schema || undefined,
  };
}

/** Formato de dump Postgres configurado (default custom). */
function pgFormatFromConfig(cfg: BackupConfig): PgFormat {
  return cfg.pgFormat === 'plain' ? 'plain' : 'custom';
}

/**
 * Genera un backup en `outPath`. Driver-aware:
 *   - sqlite: copia del .db (o pack .frcbak con la .db + imágenes)
 *   - postgres: pg_dump (o pack .frcbak con el dump + imágenes)
 */
async function writeBackupTo(
  userDataPath: string,
  outPath: string,
  includeImages: boolean,
  notes?: string,
): Promise<{ size: number; hash: string; hasImages: boolean }> {
  const dbType = getDbType(userDataPath);
  const cfg = readBackupConfig(userDataPath);

  if (dbType === 'postgres') {
    const format = pgFormatFromConfig(cfg);
    const conn = await getPgConn(userDataPath);
    const ext = pgDumpExtension(format);
    if (includeImages) {
      const tmpDump = path.join(path.dirname(outPath), `.tmp-dump-${process.pid}-${Date.now()}.${ext}`);
      try {
        await pgDump(conn, format, tmpDump, { binDir: cfg.pgBinDir });
        const result = packFrcBak({
          outFile: outPath,
          dbPath: tmpDump,
          dbFileName: `frc-gourmet.${ext}`,
          dbType: 'postgres',
          imagesDirs: imagesDirs(userDataPath),
          appVersion: app.getVersion(),
          notes,
        });
        return { size: result.size, hash: result.manifest.dbHash, hasImages: true };
      } finally {
        try { if (fs.existsSync(tmpDump)) fs.unlinkSync(tmpDump); } catch { /* noop */ }
      }
    }
    const { size } = await pgDump(conn, format, outPath, { binDir: cfg.pgBinDir });
    return { size, hash: fileSha256(outPath), hasImages: false };
  }

  // ---- SQLite ----
  const dbPath = getDbPath(userDataPath);
  if (!fs.existsSync(dbPath)) {
    throw new Error('BD no encontrada en userData. ¿Está iniciada la app?');
  }
  if (includeImages) {
    const result = packFrcBak({
      outFile: outPath,
      dbPath,
      dbFileName: 'frc-gourmet.db',
      dbType: 'sqlite',
      imagesDirs: imagesDirs(userDataPath),
      appVersion: app.getVersion(),
      notes,
    });
    return { size: result.size, hash: result.manifest.dbHash, hasImages: true };
  }
  fs.copyFileSync(dbPath, outPath);
  return { size: fs.statSync(outPath).size, hash: fileSha256(outPath), hasImages: false };
}

/** Extensión de la BD para el nombre de archivo, según driver + formato. */
function dbExtForDriver(userDataPath: string): 'db' | 'dump' | 'sql' {
  if (getDbType(userDataPath) !== 'postgres') return 'db';
  return pgDumpExtension(pgFormatFromConfig(readBackupConfig(userDataPath)));
}

async function createBackupInternal(opts: {
  userDataPath: string;
  isAutomatic: boolean;
  includeImages: boolean;
  customDir?: string;
  notes?: string;
}): Promise<CreateBackupResult> {
  try {
    const targetDir = getBackupDir(opts.userDataPath, opts.customDir);
    const fileName = buildBackupFileName({
      withImages: opts.includeImages,
      isAutomatic: opts.isAutomatic,
      dbExt: dbExtForDriver(opts.userDataPath),
    });
    const outPath = path.join(targetDir, fileName);
    const res = await writeBackupTo(opts.userDataPath, outPath, opts.includeImages, opts.notes);
    return { success: true, fileName, fullPath: outPath, ...res };
  } catch (error: any) {
    console.error('Error creando backup:', error);
    return { success: false, message: error?.message || 'Error desconocido al crear backup' };
  }
}

function clearAutoBackupTimers(): void {
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval);
    autoBackupInterval = null;
  }
  if (autoBackupTimeout) {
    clearTimeout(autoBackupTimeout);
    autoBackupTimeout = null;
  }
  nextAutoBackupAt = null;
}

/** Crea un backup automático y persiste lastAutoBackupAt + aplica retención. */
async function runAutoBackup(userDataPath: string, notes: string): Promise<void> {
  const cfg = readBackupConfig(userDataPath);
  if (!cfg.autoBackupEnabled) return;
  const result = await createBackupInternal({
    userDataPath,
    isAutomatic: true,
    includeImages: cfg.includeImages,
    customDir: cfg.customBackupDir,
    notes,
  });
  if (result.success) {
    cfg.lastAutoBackupAt = new Date().toISOString();
    writeBackupConfig(userDataPath, cfg);
    applyRetention(getBackupDir(userDataPath, cfg.customBackupDir), cfg.retentionCount);
  } else {
    console.warn('[auto-backup] no se creó backup:', result.message);
  }
}

/** Programa (recursivamente) el próximo backup diario a la hora correspondiente. */
function scheduleNextDaily(userDataPath: string): void {
  if (autoBackupTimeout) {
    clearTimeout(autoBackupTimeout);
    autoBackupTimeout = null;
  }
  const cfg = readBackupConfig(userDataPath);
  if (!cfg.autoBackupEnabled || cfg.mode !== 'daily') return;
  const next = nextDailyRunAt(new Date(), cfg.dailyTime);
  nextAutoBackupAt = next;
  const delay = Math.max(1000, next.getTime() - Date.now());
  autoBackupTimeout = setTimeout(() => {
    runAutoBackup(userDataPath, 'Backup automático diario programado')
      .catch((e) => console.error('Error en auto-backup diario:', e))
      .finally(() => scheduleNextDaily(userDataPath));
  }, delay);
}

function scheduleAutoBackup(userDataPath: string): void {
  clearAutoBackupTimers();
  const config = readBackupConfig(userDataPath);
  if (!config.autoBackupEnabled) return;

  if (config.mode === 'interval') {
    const intervalMs = Math.max(1, config.intervalHours) * 60 * 60 * 1000;
    nextAutoBackupAt = new Date(Date.now() + intervalMs);
    autoBackupInterval = setInterval(() => {
      runAutoBackup(userDataPath, 'Backup automático programado (intervalo)')
        .then(() => { nextAutoBackupAt = new Date(Date.now() + intervalMs); })
        .catch((e) => console.error('Error en auto-backup tick:', e));
    }, intervalMs);
    return;
  }

  // mode === 'daily': catch-up al iniciar si quedó un backup pendiente
  // (PC apagada a la hora programada o primer arranque del día).
  if (shouldRunDailyBackup(new Date(), config.lastAutoBackupAt, config.dailyTime)) {
    runAutoBackup(userDataPath, 'Backup automático diario (catch-up al iniciar)')
      .catch((e) => console.error('Error en auto-backup catch-up:', e));
  }
  scheduleNextDaily(userDataPath);
}

export function startAutoBackupScheduler(userDataPath: string): void {
  scheduleAutoBackup(userDataPath);
}

// ===================== Restore Postgres =====================

interface RestoreResult {
  success: boolean;
  message?: string;
  safetyBackupPath?: string;
}

/** Cierra la conexión de la app (libera pool) antes de reset/restore. */
async function closeAppDb(): Promise<void> {
  try {
    await DatabaseService.getInstance().close();
  } catch (e) {
    console.warn('Cerrando dataSource (puede ya estar cerrado):', e);
  }
}

function relaunchApp(): void {
  setTimeout(() => {
    try {
      app.relaunch();
      app.exit(0);
    } catch (e) {
      console.error('Error reiniciando app:', e);
    }
  }, 800);
}

async function restorePostgres(userDataPath: string, filePath: string): Promise<RestoreResult> {
  const cfg = readBackupConfig(userDataPath);
  const conn = await getPgConn(userDataPath);
  const backupDir = getBackupDir(userDataPath, cfg.customBackupDir);
  const isFrcBak = isFrcBakFile(filePath);

  let dumpPath = filePath;
  let format: PgFormat | null;
  let tmpToClean: string | null = null;

  if (isFrcBak) {
    const manifest = readFrcBakManifest(filePath);
    if ((manifest.dbType || 'sqlite') !== 'postgres') {
      return { success: false, message: 'El backup seleccionado es de SQLite y no es compatible con la BD Postgres actual.' };
    }
    const ext = path.extname(frcBakDbFileName(manifest)).replace('.', '') || 'dump';
    const tmp = path.join(backupDir, `.tmp-restore-${process.pid}-${Date.now()}.${ext}`);
    // Solo el dump por ahora: las imágenes se vuelcan DESPUÉS de un restore
    // exitoso para no pisarlas si la BD falla (no hay rollback de imágenes).
    const { dbDestPath } = unpackFrcBak({ srcFile: filePath, targetUserDataPath: userDataPath, dbDest: tmp, mode: 'db-only' });
    dumpPath = dbDestPath;
    tmpToClean = dbDestPath;
    format = pgFormatFromFile(dbDestPath);
  } else {
    format = pgFormatFromFile(filePath);
    if (!format) {
      return { success: false, message: 'Formato no soportado para Postgres (use .dump, .sql o .frcbak).' };
    }
  }

  if (!format) {
    if (tmpToClean) { try { fs.unlinkSync(tmpToClean); } catch { /* noop */ } }
    return { success: false, message: 'No se pudo determinar el formato del dump.' };
  }

  // Safety dump antes de tocar nada. El restore es destructivo (dropea el
  // schema); si NO podemos crear el respaldo de seguridad (binario/conexión con
  // problemas) abortamos ANTES de tocar la BD para no perder datos sin red.
  let safetyPath: string;
  try {
    safetyPath = path.join(backupDir, `pre-restore-${Date.now()}.${pgDumpExtension(format)}`);
    await pgDump(conn, format, safetyPath, { binDir: cfg.pgBinDir });
    pruneSafetyBackups(backupDir);
  } catch (e: any) {
    if (tmpToClean) { try { fs.unlinkSync(tmpToClean); } catch { /* noop */ } }
    return {
      success: false,
      message: 'No se pudo crear el backup de seguridad previo (' + (e?.message || e) + '). Se abortó la restauración para no perder datos.',
    };
  }

  await closeAppDb();

  try {
    await pgRestore(conn, format, dumpPath, { binDir: cfg.pgBinDir });
  } catch (e: any) {
    // Intentar rollback desde el safety dump.
    try {
      await pgRestore(conn, format, safetyPath, { binDir: cfg.pgBinDir });
    } catch (rollbackErr) {
      console.error('Rollback del safety dump también falló:', rollbackErr);
    }
    return { success: false, message: 'Error restaurando Postgres: ' + (e?.message || e), safetyBackupPath: safetyPath };
  } finally {
    if (tmpToClean) { try { fs.unlinkSync(tmpToClean); } catch { /* noop */ } }
  }

  // Restore OK: ahora sí volcamos las imágenes del contenedor (best-effort).
  if (isFrcBak) {
    try {
      unpackFrcBak({ srcFile: filePath, targetUserDataPath: userDataPath, mode: 'images-only' });
    } catch (e) {
      console.warn('Restore de BD OK pero fallo al extraer imágenes del .frcbak:', e);
    }
  }

  relaunchApp();
  return {
    success: true,
    message: 'Restaurado exitosamente. La aplicación se reiniciará.',
    safetyBackupPath: safetyPath,
  };
}

async function restoreSqlite(userDataPath: string, filePath: string): Promise<RestoreResult> {
  const isFrcBak = isFrcBakFile(filePath);
  const isDb = isDbFile(filePath);
  if (!isFrcBak && !isDb) {
    return { success: false, message: 'Formato no soportado (use .db o .frcbak).' };
  }
  if (isFrcBak) {
    const manifest = readFrcBakManifest(filePath);
    if ((manifest.dbType || 'sqlite') !== 'sqlite') {
      return { success: false, message: 'El backup seleccionado es de Postgres y no es compatible con la BD SQLite actual.' };
    }
  }
  if (isDb && !validateSqliteFile(filePath)) {
    return { success: false, message: 'Archivo .db inválido (header SQLite no detectado).' };
  }

  const cfg = readBackupConfig(userDataPath);
  const dbPath = getDbPath(userDataPath);
  const backupDir = getBackupDir(userDataPath, cfg.customBackupDir);
  const safetyPath = path.join(backupDir, `pre-restore-${Date.now()}.db.bak`);

  // Cerrar la BD ANTES de copiar el safety para checkpointear el WAL y no
  // dejar afuera las últimas transacciones.
  await closeAppDb();
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, safetyPath);
    pruneSafetyBackups(backupDir);
  }

  try {
    if (isDb) {
      fs.copyFileSync(filePath, dbPath);
    } else {
      unpackFrcBak({ srcFile: filePath, targetUserDataPath: userDataPath, dbDest: dbPath });
    }
  } catch (e: any) {
    if (fs.existsSync(safetyPath)) {
      try { fs.copyFileSync(safetyPath, dbPath); } catch { /* noop */ }
    }
    return { success: false, message: 'Error escribiendo backup: ' + (e?.message || e) };
  }

  relaunchApp();
  return {
    success: true,
    message: 'Restaurado exitosamente. La aplicación se reiniciará.',
    safetyBackupPath: fs.existsSync(safetyPath) ? safetyPath : undefined,
  };
}

export function registerBackupHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null
) {
  const userDataPath = app.getPath('userData');

  ipcMain.handle('backup-get-info', async () => {
    const dbType = getDbType(userDataPath);
    const profileDir = getProfileImagesPath(userDataPath);
    const productoDir = getProductoImagesPath(userDataPath);
    const config = readBackupConfig(userDataPath);
    const backupDir = getBackupDir(userDataPath, config.customBackupDir);
    const base = {
      userDataPath,
      dbType,
      profileImagesDir: profileDir,
      profileImagesSize: dirSize(profileDir),
      productoImagesDir: productoDir,
      productoImagesSize: dirSize(productoDir),
      backupDir,
      appVersion: app.getVersion(),
    };

    if (dbType === 'postgres') {
      const db = readAppSettings(userDataPath).database;
      let dbExists = false;
      let dbSize = 0;
      let connError: string | undefined;
      try {
        const conn = await getPgConn(userDataPath);
        dbExists = await pgPing(conn);
        if (dbExists) dbSize = await getPgDatabaseSize(conn);
      } catch (e: any) {
        connError = e?.message || String(e);
      }
      return {
        ...base,
        dbExists,
        dbSize,
        dbModifiedAt: null,
        dbPath: `${db.host}:${db.port}/${db.database}`,
        pgInfo: {
          host: db.host,
          port: db.port,
          database: db.database,
          username: db.username,
          schema: db.schema || 'public',
          ssl: !!db.ssl,
        },
        connError,
      };
    }

    const dbPath = getDbPath(userDataPath);
    const dbExists = fs.existsSync(dbPath);
    const dbStat = dbExists ? fs.statSync(dbPath) : null;
    return {
      ...base,
      dbPath,
      dbExists,
      dbSize: dbStat?.size ?? 0,
      dbModifiedAt: dbStat?.mtime ?? null,
    };
  });

  ipcMain.handle('backup-create', async (_e, opts: { includeImages?: boolean; customDir?: string; notes?: string }) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
      return await createBackupInternal({
        userDataPath,
        isAutomatic: false,
        includeImages: !!opts?.includeImages,
        customDir: opts?.customDir,
        notes: opts?.notes,
      });
    } catch (error: any) {
      console.error('Error creando backup:', error);
      return { success: false, message: error?.message || 'Error desconocido al crear backup' };
    }
  });

  ipcMain.handle('backup-create-and-export', async (_e, opts: { includeImages?: boolean; notes?: string }) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
      const includeImages = !!opts?.includeImages;
      const dbType = getDbType(userDataPath);
      const dbExt = dbExtForDriver(userDataPath);
      const defaultName = buildBackupFileName({ withImages: includeImages, isAutomatic: false, dbExt });

      let filters: Electron.FileFilter[];
      if (includeImages) {
        filters = [{ name: 'FRC Backup (con imágenes)', extensions: ['frcbak'] }];
      } else if (dbType === 'postgres') {
        filters = dbExt === 'sql'
          ? [{ name: 'Postgres SQL', extensions: ['sql'] }]
          : [{ name: 'Postgres dump', extensions: ['dump'] }];
      } else {
        filters = [{ name: 'SQLite DB', extensions: ['db'] }];
      }

      const saveResult = await dialog.showSaveDialog({
        title: 'Guardar backup como...',
        defaultPath: defaultName,
        filters,
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, message: 'Cancelado por el usuario' };
      }

      const res = await writeBackupTo(userDataPath, saveResult.filePath, includeImages, opts?.notes);
      return {
        success: true,
        fileName: path.basename(saveResult.filePath),
        fullPath: saveResult.filePath,
        targetDir: path.dirname(saveResult.filePath),
        ...res,
      };
    } catch (error: any) {
      console.error('Error en backup-create-and-export:', error);
      return { success: false, message: error?.message || 'Error desconocido' };
    }
  });

  ipcMain.handle('backup-list', async () => {
    const config = readBackupConfig(userDataPath);
    const dir = getBackupDir(userDataPath, config.customBackupDir);
    const list = listBackupsInDir(dir);
    return { dir, items: list };
  });

  ipcMain.handle('backup-delete', async (_e, fullPath: string) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
      if (!fullPath || !fs.existsSync(fullPath)) {
        return { success: false, message: 'Archivo no encontrado' };
      }
      const config = readBackupConfig(userDataPath);
      const allowedDir = path.resolve(getBackupDir(userDataPath, config.customBackupDir));
      const targetResolved = path.resolve(fullPath);
      if (!targetResolved.startsWith(allowedDir + path.sep) && targetResolved !== allowedDir) {
        return { success: false, message: 'Solo se pueden borrar backups del directorio configurado' };
      }
      fs.unlinkSync(targetResolved);
      return { success: true };
    } catch (error: any) {
      console.error('Error borrando backup:', error);
      return { success: false, message: error?.message || 'Error desconocido' };
    }
  });

  ipcMain.handle('backup-pick-restore-file', async () => {
    const dbType = getDbType(userDataPath);
    const filters: Electron.FileFilter[] = dbType === 'postgres'
      ? [
          { name: 'Backups Postgres', extensions: ['dump', 'sql', 'frcbak'] },
          { name: 'Postgres dump', extensions: ['dump'] },
          { name: 'Postgres SQL', extensions: ['sql'] },
          { name: 'FRC Backup', extensions: ['frcbak'] },
        ]
      : [
          { name: 'Backups FRC Gourmet', extensions: ['db', 'frcbak'] },
          { name: 'SQLite DB', extensions: ['db'] },
          { name: 'FRC Backup', extensions: ['frcbak'] },
        ];
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar backup para restaurar',
      properties: ['openFile'],
      filters,
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    const filePath = result.filePaths[0];
    let preview: any = null;
    try {
      if (isFrcBakFile(filePath)) {
        const manifest = readFrcBakManifest(filePath);
        preview = {
          type: 'frcbak',
          dbType: manifest.dbType || 'sqlite',
          createdAt: manifest.createdAt,
          appVersion: manifest.appVersion,
          notes: manifest.notes,
          dbHash: manifest.dbHash,
          fileCount: manifest.files.length,
          totalSize: manifest.files.reduce((s, f) => s + f.size, 0),
        };
      } else if (pgFormatFromFile(filePath)) {
        preview = {
          type: 'pgdump',
          dbType: 'postgres',
          format: pgFormatFromFile(filePath),
          size: fs.statSync(filePath).size,
        };
      } else if (isDbFile(filePath)) {
        const valid = validateSqliteFile(filePath);
        preview = {
          type: 'db',
          dbType: 'sqlite',
          valid,
          size: fs.statSync(filePath).size,
          hash: valid ? fileSha256(filePath) : null,
        };
      } else {
        return { success: false, message: 'Formato no soportado (use .db, .dump, .sql o .frcbak)' };
      }
    } catch (e: any) {
      return { success: false, message: 'No se pudo leer el archivo: ' + (e?.message || e) };
    }
    return { success: true, filePath, preview };
  });

  ipcMain.handle('backup-pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar carpeta de backups',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('backup-restore', async (_e, opts: { filePath: string }) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
      if (!opts?.filePath || !fs.existsSync(opts.filePath)) {
        return { success: false, message: 'Archivo no encontrado' };
      }
      const dbType = getDbType(userDataPath);
      return dbType === 'postgres'
        ? await restorePostgres(userDataPath, opts.filePath)
        : await restoreSqlite(userDataPath, opts.filePath);
    } catch (error: any) {
      console.error('Error en backup-restore:', error);
      return { success: false, message: error?.message || 'Error desconocido' };
    }
  });

  ipcMain.handle('backup-send-whatsapp', async (_e, opts: { fullPath: string; destino?: string; caption?: string }) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
      if (!opts?.fullPath || !fs.existsSync(opts.fullPath)) {
        return { success: false, message: 'Archivo no encontrado' };
      }
      const config = readBackupConfig(userDataPath);
      const allowedDir = path.resolve(getBackupDir(userDataPath, config.customBackupDir));
      const resolved = path.resolve(opts.fullPath);
      if (!resolved.startsWith(allowedDir + path.sep) && resolved !== allowedDir) {
        return { success: false, message: 'Solo se pueden enviar backups del directorio configurado' };
      }

      const stat = fs.statSync(resolved);
      if (stat.size > WHATSAPP_MAX_BYTES) {
        return {
          success: false,
          message: `El backup es demasiado grande para WhatsApp (${(stat.size / 1024 / 1024).toFixed(0)} MB; máx ${WHATSAPP_MAX_BYTES / 1024 / 1024} MB). Enviá el archivo manualmente.`,
        };
      }

      const destinoRaw = (opts.destino || config.whatsappDestino || '').trim();
      if (!destinoRaw) {
        return { success: false, message: 'Sin número de WhatsApp configurado. Cargalo en la pestaña de backup.' };
      }
      const evolution = await buildEvolutionConfig();
      const apikey = await getEvolutionApiKey();
      if (!evolution.url || !evolution.instance || !apikey) {
        return { success: false, message: 'Evolution API no configurada (Configuración → Notificaciones).' };
      }

      const destino = normalizeWhatsappNumber(destinoRaw);
      const fileName = path.basename(resolved);
      const caption = opts.caption
        || `📦 Backup FRC Gourmet\n${fileName}\n${(stat.size / 1024 / 1024).toFixed(2)} MB`;
      const res = await sendWhatsappDocumentFile(evolution, apikey, destino, resolved, { fileName, caption });
      return { success: true, destino, messageId: res.id };
    } catch (error: any) {
      console.error('Error enviando backup por WhatsApp:', error);
      return { success: false, message: error?.message || 'Error desconocido al enviar por WhatsApp' };
    }
  });

  ipcMain.handle('backup-config-get', async () => {
    const cfg = readBackupConfig(userDataPath);
    return {
      ...cfg,
      nextAutoBackupAt: nextAutoBackupAt?.toISOString() ?? null,
    };
  });

  ipcMain.handle('backup-config-set', async (_e, partial: Partial<BackupConfig>) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
      const current = readBackupConfig(userDataPath);
      const next: BackupConfig = { ...current, ...partial };
      if (next.mode !== 'interval' && next.mode !== 'daily') next.mode = 'daily';
      if (next.intervalHours < 1) next.intervalHours = 1;
      if (next.retentionCount < 0) next.retentionCount = 0;
      if (next.pgFormat !== 'plain' && next.pgFormat !== 'custom') next.pgFormat = 'custom';
      if (typeof next.whatsappDestino === 'string') next.whatsappDestino = next.whatsappDestino.trim() || undefined;
      if (typeof next.pgBinDir === 'string') next.pgBinDir = next.pgBinDir.trim() || undefined;
      // Normaliza dailyTime: vacío/null/invalido => undefined (backup al abrir cada día).
      const t = next.dailyTime ? /^(\d{1,2}):(\d{2})$/.exec(next.dailyTime.trim()) : null;
      next.dailyTime = t ? next.dailyTime!.trim() : undefined;
      writeBackupConfig(userDataPath, next);
      scheduleAutoBackup(userDataPath);
      return {
        success: true,
        config: { ...next, nextAutoBackupAt: nextAutoBackupAt?.toISOString() ?? null },
      };
    } catch (error: any) {
      console.error('Error guardando config backup:', error);
      return { success: false, message: error?.message || 'Error desconocido' };
    }
  });

  ipcMain.handle('backup-trigger-auto-now', async () => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
      const cfg = readBackupConfig(userDataPath);
      const result = await createBackupInternal({
        userDataPath,
        isAutomatic: true,
        includeImages: cfg.includeImages,
        customDir: cfg.customBackupDir,
        notes: 'Backup manual (forzado desde auto-backup)',
      });
      if (result.success) {
        cfg.lastAutoBackupAt = new Date().toISOString();
        writeBackupConfig(userDataPath, cfg);
        applyRetention(getBackupDir(userDataPath, cfg.customBackupDir), cfg.retentionCount);
      }
      return result;
    } catch (error: any) {
      return { success: false, message: error?.message || 'Error desconocido' };
    }
  });

  ipcMain.handle('backup-db-reset', async (_e, opts: { confirmation: string }) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
      if (opts?.confirmation !== 'RESET') {
        return { success: false, message: 'Confirmación incorrecta. Debe escribir RESET.' };
      }

      const dbType = getDbType(userDataPath);

      const cfg = readBackupConfig(userDataPath);
      const backupDir = getBackupDir(userDataPath, cfg.customBackupDir);

      if (dbType === 'postgres') {
        const conn = await getPgConn(userDataPath);
        // Safety dump antes de resetear (best-effort: el reset es un wipe
        // intencional confirmado por el usuario).
        let safetyPath: string | undefined;
        try {
          const format = pgFormatFromConfig(cfg);
          safetyPath = path.join(backupDir, `pre-reset-${Date.now()}.${pgDumpExtension(format)}`);
          await pgDump(conn, format, safetyPath, { binDir: cfg.pgBinDir });
          pruneSafetyBackups(backupDir);
        } catch (e) {
          console.warn('No se pudo crear safety dump pre-reset Postgres:', e);
          safetyPath = undefined;
        }
        await closeAppDb();
        try {
          await pgResetSchema(conn);
        } catch (e: any) {
          return { success: false, message: 'No se pudo resetear el schema Postgres: ' + (e?.message || e), safetyBackupPath: safetyPath };
        }
        relaunchApp();
        return {
          success: true,
          message: 'BD reseteada. La app se reiniciará y se generarán los datos iniciales.',
          safetyBackupPath: safetyPath,
        };
      }

      const dbPath = getDbPath(userDataPath);
      const safetyPath = path.join(backupDir, `pre-reset-${Date.now()}.db.bak`);

      // Cerrar ANTES de copiar el safety (checkpoint del WAL).
      await closeAppDb();
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, safetyPath);
        pruneSafetyBackups(backupDir);
      }

      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        // Eliminar también los sidecar del WAL para arrancar 100% limpio.
        for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
          if (fs.existsSync(sidecar)) { try { fs.unlinkSync(sidecar); } catch { /* noop */ } }
        }
      } catch (e: any) {
        return { success: false, message: 'No se pudo eliminar la BD: ' + (e?.message || e) };
      }

      relaunchApp();
      return {
        success: true,
        message: 'BD eliminada. La app se reiniciará y se generarán los datos iniciales.',
        safetyBackupPath: fs.existsSync(safetyPath) ? safetyPath : undefined,
      };
    } catch (error: any) {
      console.error('Error en backup-db-reset:', error);
      return { success: false, message: error?.message || 'Error desconocido' };
    }
  });

  ipcMain.handle('backup-clear-images', async (_e, opts: { confirmation: string }) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
      if (opts?.confirmation !== 'BORRAR IMAGENES') {
        return { success: false, message: 'Confirmación incorrecta.' };
      }
      rmDirRecursive(getProfileImagesPath(userDataPath));
      rmDirRecursive(getProductoImagesPath(userDataPath));
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Error desconocido' };
    }
  });
}

export function getBackupMetadataPlaceholder(): BackupMetadata {
  return {
    fileName: '',
    fullPath: '',
    size: 0,
    createdAt: new Date(),
    isAutomatic: false,
  };
}

import { app, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { DatabaseService } from '../../src/app/database/database.service';
import {
  BackupConfig,
  BackupMetadata,
  applyRetention,
  buildBackupFileName,
  copyDirRecursive,
  dirSize,
  fileSha256,
  getBackupDir,
  getDbPath,
  getProductoImagesPath,
  getProfileImagesPath,
  isDbFile,
  isFrcBakFile,
  listBackupsInDir,
  packFrcBak,
  readBackupConfig,
  readFrcBakManifest,
  rmDirRecursive,
  unpackFrcBak,
  validateSqliteFile,
  writeBackupConfig,
} from '../utils/backup-utils';

let autoBackupInterval: NodeJS.Timeout | null = null;
let nextAutoBackupAt: Date | null = null;

interface CreateBackupResult {
  success: boolean;
  fileName?: string;
  fullPath?: string;
  size?: number;
  hash?: string;
  hasImages?: boolean;
  message?: string;
}

async function createBackupInternal(opts: {
  userDataPath: string;
  isAutomatic: boolean;
  includeImages: boolean;
  customDir?: string;
  notes?: string;
}): Promise<CreateBackupResult> {
  const dbPath = getDbPath(opts.userDataPath);
  if (!fs.existsSync(dbPath)) {
    return { success: false, message: 'BD no encontrada en userData. ¿Está iniciada la app?' };
  }

  const targetDir = getBackupDir(opts.userDataPath, opts.customDir);
  const fileName = buildBackupFileName({ withImages: opts.includeImages, isAutomatic: opts.isAutomatic });
  const outPath = path.join(targetDir, fileName);

  if (opts.includeImages) {
    const result = packFrcBak({
      outFile: outPath,
      dbPath,
      imagesDirs: [
        { relRoot: 'profile-images', absDir: getProfileImagesPath(opts.userDataPath) },
        { relRoot: 'producto-images', absDir: getProductoImagesPath(opts.userDataPath) },
      ],
      appVersion: app.getVersion(),
      notes: opts.notes,
    });
    return {
      success: true,
      fileName,
      fullPath: outPath,
      size: result.size,
      hash: result.manifest.dbHash,
      hasImages: true,
    };
  } else {
    fs.copyFileSync(dbPath, outPath);
    const size = fs.statSync(outPath).size;
    const hash = fileSha256(outPath);
    return {
      success: true,
      fileName,
      fullPath: outPath,
      size,
      hash,
      hasImages: false,
    };
  }
}

function scheduleAutoBackup(userDataPath: string): void {
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval);
    autoBackupInterval = null;
    nextAutoBackupAt = null;
  }
  const config = readBackupConfig(userDataPath);
  if (!config.autoBackupEnabled) return;
  const intervalMs = Math.max(1, config.intervalHours) * 60 * 60 * 1000;

  const tick = async () => {
    try {
      const cfg = readBackupConfig(userDataPath);
      if (!cfg.autoBackupEnabled) return;
      const result = await createBackupInternal({
        userDataPath,
        isAutomatic: true,
        includeImages: cfg.includeImages,
        customDir: cfg.customBackupDir,
        notes: 'Backup automático programado',
      });
      if (result.success) {
        cfg.lastAutoBackupAt = new Date().toISOString();
        writeBackupConfig(userDataPath, cfg);
        const targetDir = getBackupDir(userDataPath, cfg.customBackupDir);
        applyRetention(targetDir, cfg.retentionCount);
      }
      nextAutoBackupAt = new Date(Date.now() + intervalMs);
    } catch (e) {
      console.error('Error en auto-backup tick:', e);
    }
  };

  nextAutoBackupAt = new Date(Date.now() + intervalMs);
  autoBackupInterval = setInterval(() => { tick(); }, intervalMs);
}

export function startAutoBackupScheduler(userDataPath: string): void {
  scheduleAutoBackup(userDataPath);
}

export function registerBackupHandlers(_dataSource: DataSource) {
  const userDataPath = app.getPath('userData');

  ipcMain.handle('backup-get-info', async () => {
    const dbPath = getDbPath(userDataPath);
    const profileDir = getProfileImagesPath(userDataPath);
    const productoDir = getProductoImagesPath(userDataPath);
    const backupDir = getBackupDir(userDataPath);
    const dbExists = fs.existsSync(dbPath);
    const dbStat = dbExists ? fs.statSync(dbPath) : null;
    return {
      userDataPath,
      dbPath,
      dbExists,
      dbSize: dbStat?.size ?? 0,
      dbModifiedAt: dbStat?.mtime ?? null,
      profileImagesDir: profileDir,
      profileImagesSize: dirSize(profileDir),
      productoImagesDir: productoDir,
      productoImagesSize: dirSize(productoDir),
      backupDir,
      appVersion: app.getVersion(),
    };
  });

  ipcMain.handle('backup-create', async (_e, opts: { includeImages?: boolean; customDir?: string; notes?: string }) => {
    try {
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
      const includeImages = !!opts?.includeImages;
      const defaultName = buildBackupFileName({ withImages: includeImages, isAutomatic: false });
      const filters = includeImages
        ? [{ name: 'FRC Backup (con imágenes)', extensions: ['frcbak'] }]
        : [{ name: 'SQLite DB', extensions: ['db'] }];
      const saveResult = await dialog.showSaveDialog({
        title: 'Guardar backup como...',
        defaultPath: defaultName,
        filters,
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, message: 'Cancelado por el usuario' };
      }
      const targetDir = path.dirname(saveResult.filePath);
      const fileName = path.basename(saveResult.filePath);

      const dbPath = getDbPath(userDataPath);
      if (!fs.existsSync(dbPath)) {
        return { success: false, message: 'BD no encontrada' };
      }
      if (includeImages) {
        const result = packFrcBak({
          outFile: saveResult.filePath,
          dbPath,
          imagesDirs: [
            { relRoot: 'profile-images', absDir: getProfileImagesPath(userDataPath) },
            { relRoot: 'producto-images', absDir: getProductoImagesPath(userDataPath) },
          ],
          appVersion: app.getVersion(),
          notes: opts?.notes,
        });
        return {
          success: true,
          fileName,
          fullPath: saveResult.filePath,
          size: result.size,
          hash: result.manifest.dbHash,
          hasImages: true,
          targetDir,
        };
      } else {
        fs.copyFileSync(dbPath, saveResult.filePath);
        return {
          success: true,
          fileName,
          fullPath: saveResult.filePath,
          size: fs.statSync(saveResult.filePath).size,
          hash: fileSha256(saveResult.filePath),
          hasImages: false,
          targetDir,
        };
      }
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
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar backup para restaurar',
      properties: ['openFile'],
      filters: [
        { name: 'Backups FRC Gourmet', extensions: ['db', 'frcbak'] },
        { name: 'SQLite DB', extensions: ['db'] },
        { name: 'FRC Backup', extensions: ['frcbak'] },
      ],
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
          createdAt: manifest.createdAt,
          appVersion: manifest.appVersion,
          notes: manifest.notes,
          dbHash: manifest.dbHash,
          fileCount: manifest.files.length,
          totalSize: manifest.files.reduce((s, f) => s + f.size, 0),
        };
      } else if (isDbFile(filePath)) {
        const valid = validateSqliteFile(filePath);
        preview = {
          type: 'db',
          valid,
          size: fs.statSync(filePath).size,
          hash: valid ? fileSha256(filePath) : null,
        };
      } else {
        return { success: false, message: 'Formato no soportado (use .db o .frcbak)' };
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
      if (!opts?.filePath || !fs.existsSync(opts.filePath)) {
        return { success: false, message: 'Archivo no encontrado' };
      }

      const filePath = opts.filePath;
      const isFrcBak = isFrcBakFile(filePath);
      const isDb = isDbFile(filePath);
      if (!isFrcBak && !isDb) {
        return { success: false, message: 'Formato no soportado (use .db o .frcbak)' };
      }

      if (isDb && !validateSqliteFile(filePath)) {
        return { success: false, message: 'Archivo .db invalido (header SQLite no detectado)' };
      }

      const dbPath = getDbPath(userDataPath);
      const safetyName = `pre-restore-${Date.now()}.db.bak`;
      const safetyPath = path.join(getBackupDir(userDataPath), safetyName);
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, safetyPath);
      }

      try {
        const dbService = DatabaseService.getInstance();
        await dbService.close();
      } catch (e) {
        console.warn('Cerrando dataSource antes del restore (puede ya estar cerrado):', e);
      }

      try {
        if (isDb) {
          fs.copyFileSync(filePath, dbPath);
        } else {
          unpackFrcBak({ srcFile: filePath, targetUserDataPath: userDataPath });
        }
      } catch (e: any) {
        if (fs.existsSync(safetyPath)) {
          try { fs.copyFileSync(safetyPath, dbPath); } catch {}
        }
        return { success: false, message: 'Error escribiendo backup: ' + (e?.message || e) };
      }

      setTimeout(() => {
        try {
          app.relaunch();
          app.exit(0);
        } catch (e) {
          console.error('Error reiniciando app post-restore:', e);
        }
      }, 800);

      return {
        success: true,
        message: 'Restaurado exitosamente. La aplicación se reiniciará.',
        safetyBackupPath: fs.existsSync(safetyPath) ? safetyPath : undefined,
      };
    } catch (error: any) {
      console.error('Error en backup-restore:', error);
      return { success: false, message: error?.message || 'Error desconocido' };
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
      const current = readBackupConfig(userDataPath);
      const next: BackupConfig = { ...current, ...partial };
      if (next.intervalHours < 1) next.intervalHours = 1;
      if (next.retentionCount < 0) next.retentionCount = 0;
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
      if (opts?.confirmation !== 'RESET') {
        return { success: false, message: 'Confirmación incorrecta. Debe escribir RESET.' };
      }

      const dbPath = getDbPath(userDataPath);
      const safetyName = `pre-reset-${Date.now()}.db.bak`;
      const safetyPath = path.join(getBackupDir(userDataPath), safetyName);
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, safetyPath);
      }

      try {
        const dbService = DatabaseService.getInstance();
        await dbService.close();
      } catch (e) {
        console.warn('Cerrando dataSource antes del reset (puede ya estar cerrado):', e);
      }

      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      } catch (e: any) {
        return { success: false, message: 'No se pudo eliminar la BD: ' + (e?.message || e) };
      }

      setTimeout(() => {
        try {
          app.relaunch();
          app.exit(0);
        } catch (e) {
          console.error('Error reiniciando app post-reset:', e);
        }
      }, 800);

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

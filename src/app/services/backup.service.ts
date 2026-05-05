import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

export interface BackupInfo {
  userDataPath: string;
  dbPath: string;
  dbExists: boolean;
  dbSize: number;
  dbModifiedAt: Date | null;
  profileImagesDir: string;
  profileImagesSize: number;
  productoImagesDir: string;
  productoImagesSize: number;
  backupDir: string;
  appVersion: string;
}

export interface BackupItem {
  fileName: string;
  fullPath: string;
  size: number;
  createdAt: Date;
  isAutomatic: boolean;
  hasImages?: boolean;
}

export interface BackupListResult {
  dir: string;
  items: BackupItem[];
}

export interface BackupConfig {
  autoBackupEnabled: boolean;
  intervalHours: number;
  retentionCount: number;
  customBackupDir?: string;
  includeImages: boolean;
  lastAutoBackupAt?: string;
  nextAutoBackupAt?: string | null;
}

export interface BackupCreateResult {
  success: boolean;
  fileName?: string;
  fullPath?: string;
  size?: number;
  hash?: string;
  hasImages?: boolean;
  message?: string;
  targetDir?: string;
}

export interface BackupRestorePreview {
  type: 'db' | 'frcbak';
  createdAt?: string;
  appVersion?: string;
  notes?: string;
  dbHash?: string;
  fileCount?: number;
  totalSize?: number;
  valid?: boolean;
  size?: number;
  hash?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private get api(): any {
    return (window as any).api;
  }

  getInfo(): Observable<BackupInfo> {
    return from(this.api.backupGetInfo() as Promise<BackupInfo>);
  }

  createLocal(opts: { includeImages?: boolean; customDir?: string; notes?: string } = {}): Observable<BackupCreateResult> {
    return from(this.api.backupCreate(opts) as Promise<BackupCreateResult>);
  }

  createAndExport(opts: { includeImages?: boolean; notes?: string } = {}): Observable<BackupCreateResult> {
    return from(this.api.backupCreateAndExport(opts) as Promise<BackupCreateResult>);
  }

  list(): Observable<BackupListResult> {
    return from(this.api.backupList() as Promise<BackupListResult>);
  }

  delete(fullPath: string): Observable<{ success: boolean; message?: string }> {
    return from(this.api.backupDelete(fullPath) as Promise<{ success: boolean; message?: string }>);
  }

  pickRestoreFile(): Observable<{ success: boolean; canceled?: boolean; filePath?: string; preview?: BackupRestorePreview; message?: string }> {
    return from(this.api.backupPickRestoreFile() as Promise<any>);
  }

  pickFolder(): Observable<{ success: boolean; canceled?: boolean; path?: string }> {
    return from(this.api.backupPickFolder() as Promise<any>);
  }

  restore(filePath: string): Observable<{ success: boolean; message?: string; safetyBackupPath?: string }> {
    return from(this.api.backupRestore({ filePath }) as Promise<any>);
  }

  getConfig(): Observable<BackupConfig> {
    return from(this.api.backupConfigGet() as Promise<BackupConfig>);
  }

  setConfig(partial: Partial<BackupConfig>): Observable<{ success: boolean; config?: BackupConfig; message?: string }> {
    return from(this.api.backupConfigSet(partial) as Promise<any>);
  }

  triggerAutoNow(): Observable<BackupCreateResult> {
    return from(this.api.backupTriggerAutoNow() as Promise<BackupCreateResult>);
  }

  resetDb(confirmation: string): Observable<{ success: boolean; message?: string; safetyBackupPath?: string }> {
    return from(this.api.backupDbReset({ confirmation }) as Promise<any>);
  }

  clearImages(confirmation: string): Observable<{ success: boolean; message?: string }> {
    return from(this.api.backupClearImages({ confirmation }) as Promise<any>);
  }
}

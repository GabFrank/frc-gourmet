import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  BackupConfig,
  BackupInfo,
  BackupItem,
  BackupRestorePreview,
  BackupService,
} from 'src/app/services/backup.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { RestoreConfirmDialogComponent } from './restore-confirm-dialog.component';
import { ResetDbConfirmDialogComponent } from './reset-db-confirm-dialog.component';

@Component({
  selector: 'app-backup-restore',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTableModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  templateUrl: './backup-restore.component.html',
  styleUrls: ['./backup-restore.component.scss'],
})
export class BackupRestoreComponent implements OnInit {
  loading = false;
  busyMessage = '';

  info: BackupInfo | null = null;
  config: BackupConfig | null = null;

  backupsDataSource = new MatTableDataSource<BackupItem>([]);
  backupsDir = '';
  displayedColumns: string[] = ['fileName', 'createdAt', 'size', 'isAutomatic', 'hasImages', 'actions'];

  @ViewChild(MatPaginator) paginator?: MatPaginator;

  backupModes = [
    { value: 'daily', label: 'Diario (recomendado)' },
    { value: 'interval', label: 'Por intervalo' },
  ];

  intervalOptions = [
    { value: 1, label: 'Cada 1 hora' },
    { value: 6, label: 'Cada 6 horas' },
    { value: 12, label: 'Cada 12 horas' },
    { value: 24, label: 'Diario (24h)' },
    { value: 48, label: 'Cada 2 días' },
    { value: 168, label: 'Semanal' },
  ];

  retentionOptions = [3, 5, 7, 10, 14, 30];

  /** UI: cuando false, el backup diario corre al abrir la app cada día (sin hora fija). */
  useFixedTime = false;

  constructor(
    private backupService: BackupService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.refreshAll();
  }

  refreshAll(): void {
    this.loadInfo();
    this.loadConfig();
    this.loadList();
  }

  loadInfo(): void {
    this.backupService.getInfo().subscribe({
      next: (info) => { this.info = info; },
      error: (err) => this.notifyError('Error al obtener info de BD', err),
    });
  }

  loadConfig(): void {
    this.backupService.getConfig().subscribe({
      next: (cfg) => {
        if (!cfg.mode) cfg.mode = 'daily';
        this.config = cfg;
        this.useFixedTime = !!cfg.dailyTime;
      },
      error: (err) => this.notifyError('Error al obtener configuración', err),
    });
  }

  onUseFixedTimeChange(): void {
    if (this.useFixedTime && this.config && !this.config.dailyTime) {
      this.config.dailyTime = '02:00';
    }
  }

  loadList(): void {
    this.backupService.list().subscribe({
      next: (res) => {
        this.backupsDir = res.dir;
        this.backupsDataSource.data = res.items;
        if (this.paginator) {
          this.backupsDataSource.paginator = this.paginator;
        }
      },
      error: (err) => this.notifyError('Error al listar backups', err),
    });
  }

  // ================== ACCIONES BACKUP ==================
  createBackupLocal(includeImages: boolean): void {
    this.startBusy(includeImages ? 'Creando backup completo...' : 'Creando backup de BD...');
    this.backupService.createLocal({ includeImages }).subscribe({
      next: (res) => {
        this.endBusy();
        if (res.success) {
          this.notifyOk(`Backup creado: ${res.fileName}`);
          this.loadList();
        } else {
          this.notifyError('No se pudo crear backup', res.message);
        }
      },
      error: (err) => { this.endBusy(); this.notifyError('Error', err); },
    });
  }

  createAndExport(includeImages: boolean): void {
    this.startBusy('Generando backup y solicitando ubicación...');
    this.backupService.createAndExport({ includeImages }).subscribe({
      next: (res) => {
        this.endBusy();
        if (res.success) {
          this.notifyOk(`Backup exportado a: ${res.fullPath}`);
        } else if (res.message !== 'Cancelado por el usuario') {
          this.notifyError('No se pudo exportar', res.message);
        }
      },
      error: (err) => { this.endBusy(); this.notifyError('Error', err); },
    });
  }

  // ================== RESTAURAR ==================
  restoreFromFile(): void {
    this.backupService.pickRestoreFile().subscribe({
      next: (res) => {
        if (res.canceled) return;
        if (!res.success || !res.filePath) {
          this.notifyError('Archivo inválido', res.message);
          return;
        }
        this.openRestoreConfirm(res.filePath, res.preview!);
      },
      error: (err) => this.notifyError('Error al elegir archivo', err),
    });
  }

  restoreFromList(item: BackupItem): void {
    const preview: BackupRestorePreview = {
      type: item.hasImages ? 'frcbak' : 'db',
      size: item.size,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
    };
    this.openRestoreConfirm(item.fullPath, preview);
  }

  private openRestoreConfirm(filePath: string, preview: BackupRestorePreview): void {
    const ref = this.dialog.open(RestoreConfirmDialogComponent, {
      width: '560px',
      disableClose: true,
      data: { filePath, preview },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.startBusy('Restaurando backup. La aplicación se reiniciará...');
      this.backupService.restore(filePath).subscribe({
        next: (res) => {
          if (res.success) {
            this.notifyOk('Restaurado. Reiniciando...');
          } else {
            this.endBusy();
            this.notifyError('No se pudo restaurar', res.message);
          }
        },
        error: (err) => { this.endBusy(); this.notifyError('Error en restore', err); },
      });
    });
  }

  // ================== ELIMINAR ==================
  deleteBackup(item: BackupItem): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '460px',
      data: {
        title: 'Eliminar backup',
        message: `¿Seguro que querés eliminar el backup "${item.fileName}"?\nEsta acción no se puede deshacer.`,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.backupService.delete(item.fullPath).subscribe({
        next: (res) => {
          if (res.success) {
            this.notifyOk('Backup eliminado');
            this.loadList();
          } else {
            this.notifyError('No se pudo eliminar', res.message);
          }
        },
        error: (err) => this.notifyError('Error', err),
      });
    });
  }

  // ================== AUTO-BACKUP ==================
  toggleAutoBackup(): void {
    if (!this.config) return;
    const next: Partial<BackupConfig> = { autoBackupEnabled: this.config.autoBackupEnabled };
    this.backupService.setConfig(next).subscribe({
      next: (res) => {
        if (res.success && res.config) {
          this.config = res.config;
          this.notifyOk(this.config.autoBackupEnabled ? 'Auto-backup activado' : 'Auto-backup desactivado');
        } else {
          this.notifyError('No se pudo guardar', res.message);
        }
      },
      error: (err) => this.notifyError('Error', err),
    });
  }

  saveConfig(): void {
    if (!this.config) return;
    const partial: Partial<BackupConfig> = {
      autoBackupEnabled: this.config.autoBackupEnabled,
      mode: this.config.mode,
      intervalHours: this.config.intervalHours,
      dailyTime: this.config.mode === 'daily' && this.useFixedTime ? (this.config.dailyTime || '02:00') : null,
      retentionCount: this.config.retentionCount,
      includeImages: this.config.includeImages,
      customBackupDir: this.config.customBackupDir,
    };
    this.backupService.setConfig(partial).subscribe({
      next: (res) => {
        if (res.success && res.config) {
          this.config = res.config;
          this.notifyOk('Configuración guardada');
          this.loadList();
        } else {
          this.notifyError('No se pudo guardar', res.message);
        }
      },
      error: (err) => this.notifyError('Error', err),
    });
  }

  pickCustomBackupDir(): void {
    this.backupService.pickFolder().subscribe({
      next: (res) => {
        if (res.success && res.path && this.config) {
          this.config.customBackupDir = res.path;
          this.saveConfig();
        }
      },
      error: (err) => this.notifyError('Error eligiendo carpeta', err),
    });
  }

  resetCustomDir(): void {
    if (!this.config) return;
    this.config.customBackupDir = undefined;
    this.saveConfig();
  }

  triggerAutoBackupNow(): void {
    this.startBusy('Generando backup automático...');
    this.backupService.triggerAutoNow().subscribe({
      next: (res) => {
        this.endBusy();
        if (res.success) {
          this.notifyOk(`Backup creado: ${res.fileName}`);
          this.loadList();
          this.loadConfig();
        } else {
          this.notifyError('No se pudo crear backup automático', res.message);
        }
      },
      error: (err) => { this.endBusy(); this.notifyError('Error', err); },
    });
  }

  // ================== RESET BD ==================
  resetDatabase(): void {
    const ref = this.dialog.open(ResetDbConfirmDialogComponent, {
      width: '560px',
      disableClose: true,
    });
    ref.afterClosed().subscribe((confirmation: string | undefined) => {
      if (!confirmation) return;
      this.startBusy('Eliminando BD. La app se reiniciará...');
      this.backupService.resetDb(confirmation).subscribe({
        next: (res) => {
          if (res.success) {
            this.notifyOk('BD eliminada. Reiniciando...');
          } else {
            this.endBusy();
            this.notifyError('No se pudo resetear', res.message);
          }
        },
        error: (err) => { this.endBusy(); this.notifyError('Error', err); },
      });
    });
  }

  // ================== HELPERS ==================
  startBusy(msg: string): void { this.loading = true; this.busyMessage = msg; }
  endBusy(): void { this.loading = false; this.busyMessage = ''; }

  notifyOk(msg: string): void {
    this.snackBar.open(msg, 'Cerrar', { duration: 4000, panelClass: ['snack-ok'] });
  }
  notifyError(title: string, err?: any): void {
    const detail = typeof err === 'string' ? err : err?.message || JSON.stringify(err) || '';
    this.snackBar.open(`${title}${detail ? ': ' + detail : ''}`, 'Cerrar', { duration: 6000, panelClass: ['snack-error'] });
  }

  formatSize(bytes: number | undefined | null): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 100 || i === 0 ? 0 : 2)} ${units[i]}`;
  }

  formatDate(d: Date | string | null | undefined): string {
    if (!d) return '-';
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

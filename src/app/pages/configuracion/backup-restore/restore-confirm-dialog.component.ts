import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { BackupRestorePreview } from 'src/app/services/backup.service';

@Component({
  selector: 'app-restore-confirm-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="warn-icon">warning</mat-icon>
      Confirmar restauración
    </h2>
    <mat-dialog-content>
      <p class="warn-text">
        Esta acción <strong>reemplazará la base de datos actual</strong> con el backup seleccionado.
        Antes del reemplazo se hace un backup de seguridad automático.
        La aplicación se reiniciará automáticamente.
      </p>

      <div class="preview-box">
        <div class="preview-row">
          <span class="label">Archivo:</span>
          <span class="value mono">{{ data.filePath }}</span>
        </div>
        <div class="preview-row">
          <span class="label">Tipo:</span>
          <span class="value">{{ data.preview.type === 'frcbak' ? 'Backup completo (BD + imágenes)' : 'Solo BD' }}</span>
        </div>
        <div class="preview-row" *ngIf="data.preview.createdAt">
          <span class="label">Creado:</span>
          <span class="value">{{ data.preview.createdAt }}</span>
        </div>
        <div class="preview-row" *ngIf="data.preview.appVersion">
          <span class="label">Versión origen:</span>
          <span class="value">{{ data.preview.appVersion }}</span>
        </div>
        <div class="preview-row" *ngIf="data.preview.size">
          <span class="label">Tamaño:</span>
          <span class="value">{{ formatSize(data.preview.size) }}</span>
        </div>
        <div class="preview-row" *ngIf="data.preview.fileCount">
          <span class="label">Archivos:</span>
          <span class="value">{{ data.preview.fileCount }}</span>
        </div>
        <div class="preview-row" *ngIf="data.preview.notes">
          <span class="label">Notas:</span>
          <span class="value">{{ data.preview.notes }}</span>
        </div>
      </div>

      <p class="instruction">
        Para confirmar, escribí <strong>RESTAURAR</strong> en el campo de abajo:
      </p>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Confirmación</mat-label>
        <input matInput [(ngModel)]="confirmationText" placeholder="RESTAURAR" autocomplete="off">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="warn"
              [disabled]="confirmationText !== 'RESTAURAR'"
              (click)="confirm()">
        <mat-icon>restore</mat-icon>
        <span>Restaurar y reiniciar</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .warn-icon {
      color: #c62828;
      vertical-align: middle;
      margin-right: 6px;
    }
    .warn-text {
      background: rgba(198, 40, 40, 0.08);
      padding: 12px;
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 12px;
    }
    .preview-box {
      background: var(--surface-variant, rgba(0, 0, 0, 0.04));
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 12px;
      font-size: 13px;
    }
    .preview-row {
      display: flex;
      gap: 8px;
      padding: 2px 0;
      align-items: flex-start;
    }
    .label {
      font-weight: 500;
      min-width: 110px;
      color: var(--text-secondary);
    }
    .value {
      flex: 1;
      word-break: break-all;
    }
    .mono {
      font-family: 'Roboto Mono', 'Courier New', monospace;
      font-size: 12px;
    }
    .instruction {
      font-size: 13px;
      margin-top: 8px;
    }
    .full-width { width: 100%; }
  `],
})
export class RestoreConfirmDialogComponent {
  confirmationText = '';

  constructor(
    public dialogRef: MatDialogRef<RestoreConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { filePath: string; preview: BackupRestorePreview },
  ) {}

  confirm(): void {
    if (this.confirmationText === 'RESTAURAR') {
      this.dialogRef.close(true);
    }
  }

  formatSize(bytes: number | undefined): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 100 || i === 0 ? 0 : 2)} ${units[i]}`;
  }
}

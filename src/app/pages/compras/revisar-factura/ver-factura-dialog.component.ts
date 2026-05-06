import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-ver-factura-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="ver-factura-header">
      <div class="title">
        <mat-icon>{{ data.archivoTipo === 'PDF' ? 'picture_as_pdf' : 'image' }}</mat-icon>
        <span>{{ data.archivoNombre || 'Factura' }}</span>
      </div>
      <button mat-icon-button (click)="cerrar()" matTooltip="Cerrar">
        <mat-icon>close</mat-icon>
      </button>
    </div>
    <div class="ver-factura-body">
      <img
        *ngIf="data.previewUrl && !errored"
        [src]="data.previewUrl"
        alt="Factura"
        (error)="onError()" />
      <div class="fallback" *ngIf="errored || !data.previewUrl">
        <mat-icon>broken_image</mat-icon>
        <p>No se pudo cargar la vista previa.</p>
        <small>{{ data.archivoNombre }}</small>
      </div>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }
    .ver-factura-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid var(--divider, #333);
      background: var(--surface, transparent);

      .title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-primary);
        font-weight: 500;
      }
    }
    .ver-factura-body {
      flex: 1;
      overflow: auto;
      background: var(--surface-variant, #1e1e1e);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 12px;

      img {
        max-width: 100%;
        width: 100%;
        height: auto;
        display: block;
      }
    }
    .fallback {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--text-secondary);
      padding: 48px;
      text-align: center;

      mat-icon { font-size: 64px; width: 64px; height: 64px; opacity: 0.4; }
    }
  `],
})
export class VerFacturaDialogComponent {
  errored = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: {
      archivoUrl: string;
      archivoNombre: string;
      archivoTipo: 'PDF' | 'IMAGE';
      previewUrl: string;
    },
    private dialogRef: MatDialogRef<VerFacturaDialogComponent>,
  ) {}

  onError(): void {
    this.errored = true;
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}

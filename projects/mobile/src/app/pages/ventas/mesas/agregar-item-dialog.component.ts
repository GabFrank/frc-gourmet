import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface AgregarItemData {
  nombre: string;
  precioUnitario: number;
}

/**
 * Diálogo compacto para elegir la cantidad de un producto antes de agregarlo
 * a la cuenta de la mesa. Devuelve la cantidad (entero ≥ 1) al confirmar, o
 * `undefined` si se cancela. Las variaciones/adicionales/observaciones se
 * sumarán a este diálogo en M2.x.
 */
@Component({
  selector: 'app-agregar-item-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.nombre }}</h2>
    <mat-dialog-content>
      <div class="precio">{{ data.precioUnitario | number: '1.0-2' }} c/u</div>
      <div class="stepper">
        <button mat-icon-button (click)="dec()" [disabled]="cantidad <= 1" aria-label="Menos">
          <mat-icon>remove_circle</mat-icon>
        </button>
        <span class="cant">{{ cantidad }}</span>
        <button mat-icon-button (click)="inc()" aria-label="Más">
          <mat-icon>add_circle</mat-icon>
        </button>
      </div>
      <div class="total">Total: {{ data.precioUnitario * cantidad | number: '1.0-2' }}</div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(undefined)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="ref.close(cantidad)">
        Agregar {{ cantidad }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .precio {
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
        margin-bottom: 12px;
      }
      .stepper {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;
        margin: 8px 0;
      }
      .stepper mat-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
      }
      .cant {
        font-size: 1.6rem;
        font-weight: 600;
        min-width: 48px;
        text-align: center;
      }
      .total {
        text-align: center;
        font-weight: 600;
        color: var(--primary, #1976d2);
        margin-top: 8px;
      }
    `,
  ],
})
export class AgregarItemDialogComponent {
  cantidad = 1;

  constructor(
    public ref: MatDialogRef<AgregarItemDialogComponent, number | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: AgregarItemData,
  ) {}

  inc(): void {
    this.cantidad++;
  }

  dec(): void {
    if (this.cantidad > 1) this.cantidad--;
  }
}

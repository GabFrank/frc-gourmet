import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface BuffetPesoDialogData {
  nombre: string;
  precioPorKg: number;
  taraGramos?: number | null;
  pesoMinimoGramos?: number | null;
  precioMinimo?: number | null;
  precioMaximo?: number | null;
  decimalesMoneda?: number;
  simbolo?: string;
  /** Peso bruto prellenado (ej: leído de una etiqueta EAN-13 de balanza). */
  pesoInicialGramos?: number;
}

export interface BuffetPesoDialogResult {
  pesoBrutoGramos: number;
  pesoTaraGramos: number;
  pesoNetoGramos: number;
  cantidadKg: number;
  total: number;
  aplicoLibre: boolean;
  precioVentaUnitarioEfectivo: number;
  precioPorKg: number;
}

/**
 * Pesaje de buffet por kilo (mobile). El mesero ingresa el peso BRUTO en gramos;
 * se descuenta la tara y se cobra (neto/1000) * precio/kg, aplicando el mínimo y
 * el tope "buffet libre" si están configurados. Misma lógica que el PdV desktop
 * (buffet-peso.util) reimplementada acá para no acoplar al código de Electron.
 */
@Component({
  selector: 'app-buffet-peso-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title class="bp-title">{{ data.nombre }}</h2>
    <mat-dialog-content class="bp-content">
      <p class="bp-precio">
        {{ data.simbolo }} {{ precioPorKg | number: digits }} <span class="bp-kg">/ kg</span>
      </p>

      <mat-form-field appearance="outline" class="bp-field">
        <mat-label>Peso bruto (gramos)</mat-label>
        <input
          matInput
          type="number"
          inputmode="numeric"
          [(ngModel)]="pesoBruto"
          (ngModelChange)="recalcular()"
          min="0"
          autofocus
        />
        <span matSuffix>g</span>
      </mat-form-field>

      <div class="bp-resumen">
        <div class="bp-row" *ngIf="tara > 0">
          <span>Tara (plato)</span>
          <span>{{ tara | number: '1.0-0' }} g</span>
        </div>
        <div class="bp-row">
          <span>Peso neto</span>
          <span class="bp-strong">{{ pesoNeto | number: '1.0-0' }} g</span>
        </div>
        <div class="bp-row bp-total">
          <span>Total</span>
          <span>{{ data.simbolo }} {{ total | number: digits }}</span>
        </div>
        <p class="bp-aviso" *ngIf="aplicoLibre">Aplica tope "buffet libre".</p>
        <p class="bp-aviso" *ngIf="bajoMinimo && !aplicoLibre">Se aplica el precio mínimo.</p>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()">Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="!puedeAgregar" (click)="aceptar()">
        Agregar
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .bp-title {
        margin: 0;
        font-size: 1.15rem;
      }
      .bp-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 260px;
      }
      .bp-precio {
        margin: 4px 0 10px;
        font-weight: 700;
        font-size: 1.1rem;
        color: var(--primary, #1976d2);
      }
      .bp-kg {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
      }
      .bp-field {
        width: 100%;
      }
      .bp-resumen {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .bp-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.98rem;
        color: var(--text-secondary, rgba(0, 0, 0, 0.7));
      }
      .bp-strong {
        font-weight: 700;
        color: var(--text-primary, rgba(0, 0, 0, 0.9));
      }
      .bp-total {
        margin-top: 4px;
        padding-top: 8px;
        border-top: 1px solid var(--border-color, rgba(0, 0, 0, 0.12));
        font-size: 1.2rem;
        font-weight: 800;
        color: var(--primary, #1976d2);
      }
      .bp-aviso {
        margin: 4px 0 0;
        font-size: 0.85rem;
        font-style: italic;
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
      }
    `,
  ],
})
export class BuffetPesoDialogComponent {
  pesoBruto = 0;
  tara = 0;
  precioPorKg = 0;
  digits = '1.0-2';

  // Precalculado (regla: nada de funciones en template).
  pesoNeto = 0;
  cantidadKg = 0;
  total = 0;
  aplicoLibre = false;
  bajoMinimo = false;
  puedeAgregar = false;

  constructor(
    public dialogRef: MatDialogRef<BuffetPesoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BuffetPesoDialogData,
  ) {
    this.tara = Number(data.taraGramos) || 0;
    this.precioPorKg = Number(data.precioPorKg) || 0;
    this.digits = `1.0-${data.decimalesMoneda ?? 0}`;
    if (data.pesoInicialGramos && data.pesoInicialGramos > 0) {
      this.pesoBruto = data.pesoInicialGramos;
    }
    this.recalcular();
  }

  recalcular(): void {
    const bruto = Number(this.pesoBruto) || 0;
    const neto = Math.max(bruto - this.tara, 0);
    const cantidadKg = neto / 1000;
    const subtotal = cantidadKg * this.precioPorKg;
    const precioMinimo = this.data.precioMinimo == null ? null : Number(this.data.precioMinimo);
    const precioMaximo = this.data.precioMaximo == null ? null : Number(this.data.precioMaximo);

    let total = subtotal;
    const aplicoLibre = precioMaximo != null && subtotal >= precioMaximo;
    if (aplicoLibre) {
      total = precioMaximo as number;
    } else if (precioMinimo != null && total < precioMinimo) {
      total = precioMinimo;
    }

    this.pesoNeto = neto;
    this.cantidadKg = cantidadKg;
    this.total = total;
    this.aplicoLibre = aplicoLibre;
    this.bajoMinimo = precioMinimo != null && subtotal < precioMinimo;
    this.puedeAgregar = neto > 0 && total > 0;
  }

  cancelar(): void {
    this.dialogRef.close();
  }

  aceptar(): void {
    if (!this.puedeAgregar) return;
    const efectivo = this.cantidadKg > 0 ? this.total / this.cantidadKg : this.total;
    const result: BuffetPesoDialogResult = {
      pesoBrutoGramos: Number(this.pesoBruto) || 0,
      pesoTaraGramos: this.tara,
      pesoNetoGramos: this.pesoNeto,
      cantidadKg: this.cantidadKg,
      total: this.total,
      aplicoLibre: this.aplicoLibre,
      precioVentaUnitarioEfectivo: efectivo,
      precioPorKg: this.precioPorKg,
    };
    this.dialogRef.close(result);
  }
}

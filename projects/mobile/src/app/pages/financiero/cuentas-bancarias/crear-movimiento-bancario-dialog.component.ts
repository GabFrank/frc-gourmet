import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

export interface CrearMovimientoData {
  cuentaBancariaId: number;
  simbolo?: string;
}

const TIPOS = [
  { value: 'ENTRADA_MANUAL', label: 'Entrada manual (ingreso)' },
  { value: 'SALIDA_MANUAL', label: 'Salida manual (egreso)' },
  { value: 'AJUSTE_POSITIVO', label: 'Ajuste positivo' },
  { value: 'AJUSTE_NEGATIVO', label: 'Ajuste negativo' },
];

/**
 * Registrar un movimiento bancario manual sobre una cuenta. Ajusta el saldo de
 * la cuenta (± según el tipo). Requiere BANCOS_GESTIONAR.
 */
@Component({
  selector: 'app-crear-movimiento-bancario-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Nuevo movimiento</h2>
    <mat-dialog-content>
      <mat-progress-bar *ngIf="saving" mode="indeterminate"></mat-progress-bar>
      <form [formGroup]="form" class="cmb-form">
        <mat-form-field appearance="outline" class="cmb-field">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="tipoMovimiento">
            <mat-option *ngFor="let t of tipos" [value]="t.value">{{ t.label }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="cmb-field">
          <mat-label>Monto</mat-label>
          <input matInput type="number" inputmode="decimal" formControlName="monto" min="0.01" step="any" />
          <span matTextPrefix *ngIf="data.simbolo">{{ data.simbolo }}&nbsp;</span>
          <mat-error *ngIf="form.controls.monto.hasError('required')">Requerido</mat-error>
          <mat-error *ngIf="form.controls.monto.hasError('min')">Debe ser mayor a 0</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="cmb-field">
          <mat-label>Observación</mat-label>
          <input matInput formControlName="observacion" autocapitalize="characters" />
          <mat-error *ngIf="form.controls.observacion.hasError('required')">Requerido</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="cmb-field">
          <mat-label>N° comprobante (opcional)</mat-label>
          <input matInput formControlName="numeroComprobante" autocapitalize="characters" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(false)" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="guardar()" [disabled]="form.invalid || saving">Registrar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .cmb-form {
        display: flex;
        flex-direction: column;
        padding-top: 8px;
      }
      .cmb-field {
        width: 100%;
      }
    `,
  ],
})
export class CrearMovimientoBancarioDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly snack = inject(MatSnackBar);

  readonly tipos = TIPOS;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    tipoMovimiento: ['ENTRADA_MANUAL', Validators.required],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    observacion: ['', Validators.required],
    numeroComprobante: [''],
  });

  constructor(
    public ref: MatDialogRef<CrearMovimientoBancarioDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: CrearMovimientoData,
  ) {}

  async guardar(): Promise<void> {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const v = this.form.getRawValue();
    const payload = {
      cuentaBancariaId: this.data.cuentaBancariaId,
      tipoMovimiento: v.tipoMovimiento,
      monto: Number(v.monto),
      fecha: new Date(),
      observacion: (v.observacion || '').toUpperCase(),
      numeroComprobante: v.numeroComprobante ? v.numeroComprobante.toUpperCase() : null,
    };
    try {
      await firstValueFrom(this.repo.createMovimientoBancario(payload));
      this.ref.close(true);
    } catch (e) {
      this.saving = false;
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw) ? 'Sin permiso' : raw.replace(/^Error:\s*/, '') || 'No se pudo registrar';
      this.snack.open(msg, 'OK', { duration: 4000 });
    }
  }
}

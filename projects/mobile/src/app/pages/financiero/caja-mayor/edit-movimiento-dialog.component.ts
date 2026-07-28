import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

export interface EditMovimientoData {
  movId: number;
  tipoLabel: string;
  monedaId?: number;
  formaPagoId?: number;
  monto: number;
  observacion?: string;
}

interface Opcion {
  id: number;
  label: string;
}

/**
 * Editar un movimiento manual de Caja Mayor (moneda / forma de pago / monto /
 * observación). Se limita a ajustes manuales desde el detalle. El handler
 * recalcula el saldo en transacción. Devuelve `true` si se guardó.
 */
@Component({
  selector: 'app-edit-movimiento-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Editar movimiento</h2>
    <mat-progress-bar *ngIf="loading || saving" mode="indeterminate"></mat-progress-bar>
    <mat-dialog-content>
      <p class="sub">{{ data.tipoLabel }}</p>
      <form [formGroup]="form" class="col">
        <mat-form-field appearance="outline">
          <mat-label>Monto</mat-label>
          <input matInput type="number" inputmode="decimal" formControlName="monto" min="0.01" step="any" />
          <mat-error *ngIf="form.controls.monto.hasError('required')">Requerido</mat-error>
          <mat-error *ngIf="form.controls.monto.hasError('min')">Debe ser mayor a 0</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Moneda</mat-label>
          <mat-select formControlName="monedaId">
            <mat-option *ngFor="let m of monedas" [value]="m.id">{{ m.label }}</mat-option>
          </mat-select>
          <mat-error *ngIf="form.controls.monedaId.hasError('required')">Requerido</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Forma de pago</mat-label>
          <mat-select formControlName="formaPagoId">
            <mat-option *ngFor="let f of formasPago" [value]="f.id">{{ f.label }}</mat-option>
          </mat-select>
          <mat-error *ngIf="form.controls.formaPagoId.hasError('required')">Requerido</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Observación (opcional)</mat-label>
          <input matInput formControlName="observacion" autocapitalize="characters" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(false)" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="guardar()" [disabled]="saving || loading">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .sub { margin: 0 0 8px; color: var(--text-secondary); font-size: 0.85rem; }
      .col { display: flex; flex-direction: column; }
      .col mat-form-field { width: 100%; }
    `,
  ],
})
export class EditMovimientoDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly snack = inject(MatSnackBar);

  monedas: Opcion[] = [];
  formasPago: Opcion[] = [];
  loading = true;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    monedaId: [null as number | null, Validators.required],
    formaPagoId: [null as number | null, Validators.required],
    observacion: [''],
  });

  constructor(
    public ref: MatDialogRef<EditMovimientoDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: EditMovimientoData,
  ) {}

  ngOnInit(): void {
    Promise.all([
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getFormasPago()),
    ])
      .then(([monedas, formas]: [any[], any[]]) => {
        this.monedas = (monedas || [])
          .filter((m) => m.activo !== false)
          .map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        this.formasPago = (formas || [])
          .filter((f) => f.activo !== false)
          .map((f) => ({ id: f.id, label: f.nombre }));
        this.form.patchValue({
          monto: this.data.monto,
          monedaId: this.data.monedaId ?? null,
          formaPagoId: this.data.formaPagoId ?? null,
          observacion: this.data.observacion ?? '',
        });
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar los catálogos', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const payload = {
      monedaId: v.monedaId,
      formaPagoId: v.formaPagoId,
      monto: v.monto,
      observacion: v.observacion ? v.observacion.toUpperCase() : null,
    };
    try {
      await firstValueFrom(this.repo.editCajaMayorMovimiento(this.data.movId, payload));
      this.snack.open('Movimiento actualizado', 'OK', { duration: 2500 });
      this.ref.close(true);
    } catch (e) {
      this.snack.open(/PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso' : 'No se pudo actualizar', 'OK', { duration: 3500 });
      this.saving = false;
    }
  }
}

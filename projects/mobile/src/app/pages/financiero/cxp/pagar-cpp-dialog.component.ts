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
import { formaPagoEfectivo } from '../forma-pago-efectivo.util';

export interface PagarCppData {
  cuotaId: number;
  titulo: string;
  saldo: number;
  monedaId: number;
  simbolo: string;
  decimales: number;
}

interface Opcion {
  id: number;
  label: string;
}

/**
 * Pagar una cuota de Cuenta por Pagar desde la Caja Mayor (efectivo). El pago
 * desde cuenta bancaria queda en el escritorio. Requiere COMPRAS_GESTIONAR.
 * Devuelve `true` si se pagó.
 */
@Component({
  selector: 'app-pagar-cpp-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Pagar cuota</h2>
    <mat-progress-bar *ngIf="loading || saving" mode="indeterminate"></mat-progress-bar>
    <mat-dialog-content>
      <p class="sub">{{ data.titulo }}</p>
      <p class="saldo">Saldo: {{ data.simbolo }} {{ data.saldo | number: '1.0-' + data.decimales }}</p>
      <form [formGroup]="form" class="col">
        <mat-form-field appearance="outline">
          <mat-label>Caja mayor</mat-label>
          <mat-select formControlName="cajaMayorId">
            <mat-option *ngFor="let c of cajas" [value]="c.id">{{ c.label }}</mat-option>
          </mat-select>
          <mat-error *ngIf="form.controls.cajaMayorId.hasError('required')">Requerido</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Monto a pagar</mat-label>
          <input matInput type="number" inputmode="decimal" formControlName="monto" min="0.01" step="any" />
          <mat-error *ngIf="form.controls.monto.hasError('required')">Requerido</mat-error>
          <mat-error *ngIf="form.controls.monto.hasError('min')">Debe ser mayor a 0</mat-error>
          <mat-error *ngIf="form.controls.monto.hasError('max')">No puede superar el saldo</mat-error>
        </mat-form-field>

        <p class="efectivo">Se paga en <strong>{{ efectivoLabel }}</strong> desde la caja mayor.</p>

        <mat-form-field appearance="outline">
          <mat-label>Observación (opcional)</mat-label>
          <input matInput formControlName="observacion" autocapitalize="characters" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(false)" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="pagar()" [disabled]="saving || loading">Pagar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .sub { margin: 0 0 4px; color: var(--text-primary); font-weight: 500; }
      .saldo { margin: 0 0 12px; color: var(--text-secondary); font-size: 0.85rem; }
      .efectivo { margin: 0 4px 8px; font-size: 0.8rem; color: var(--text-secondary); }
      .col { display: flex; flex-direction: column; }
      .col mat-form-field { width: 100%; }
    `,
  ],
})
export class PagarCppDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly snack = inject(MatSnackBar);

  cajas: Opcion[] = [];
  private formaPagoId: number | null = null;
  efectivoLabel = 'Efectivo';
  loading = true;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    cajaMayorId: [null as number | null, Validators.required],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    observacion: [''],
  });

  constructor(
    public ref: MatDialogRef<PagarCppDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: PagarCppData,
  ) {}

  ngOnInit(): void {
    this.form.controls.monto.addValidators(Validators.max(this.data.saldo + 0.005));
    Promise.all([
      firstValueFrom(this.repo.getCajasMayor()),
      firstValueFrom(this.repo.getFormasPago()),
    ])
      .then(([cajas, formas]: [any[], any[]]) => {
        this.cajas = (cajas || [])
          .filter((c) => (c.estado || '').toUpperCase().includes('ABIERT'))
          .map((c) => ({ id: c.id, label: c.nombre || `Caja Mayor #${c.id}` }));
        const efectivo = formaPagoEfectivo(formas || []);
        this.efectivoLabel = efectivo?.nombre || 'Efectivo';
        this.formaPagoId = efectivo?.id ?? null;
        if (this.cajas.length === 1) this.form.controls.cajaMayorId.setValue(this.cajas[0].id);
        this.form.controls.monto.setValue(this.data.saldo);
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar las cajas', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  async pagar(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const payload = {
      cuotaId: this.data.cuotaId,
      monto: v.monto,
      fuente: 'CAJA_MAYOR',
      cajaMayorId: v.cajaMayorId,
      monedaId: this.data.monedaId,
      formaPagoId: this.formaPagoId,
      observacion: v.observacion ? v.observacion.toUpperCase() : undefined,
    };
    try {
      await firstValueFrom(this.repo.pagarCppCuota(payload));
      this.snack.open('Cuota pagada', 'OK', { duration: 2500 });
      this.ref.close(true);
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw) ? 'Sin permiso para pagar' : raw.replace(/^Error:\s*/, '') || 'No se pudo pagar';
      this.snack.open(msg, 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}

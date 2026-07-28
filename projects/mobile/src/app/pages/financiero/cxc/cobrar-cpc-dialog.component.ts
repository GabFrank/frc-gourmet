import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { formaPagoEfectivo } from '../forma-pago-efectivo.util';

export interface CobrarCpcData {
  cuotaId: number;
  titulo: string;
  saldo: number;
  monedaId: number;
  simbolo: string;
  decimales: number;
}

interface Opcion { id: number; label: string; }

/**
 * Cobrar una cuota de Cuenta por Cobrar hacia la Caja Mayor (efectivo) o hacia
 * una Cuenta bancaria. Para banco se ofrecen solo cuentas de la MISMA moneda de
 * la cuota (evita cotización). Requiere CPC_COBRAR. Devuelve `true` si se cobró.
 */
@Component({
  selector: 'app-cobrar-cpc-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Cobrar cuota</h2>
    <mat-progress-bar *ngIf="loading || saving" mode="indeterminate"></mat-progress-bar>
    <mat-dialog-content>
      <p class="sub">{{ data.titulo }}</p>
      <p class="saldo">Saldo: {{ data.simbolo }} {{ data.saldo | number: '1.0-' + data.decimales }}</p>
      <form [formGroup]="form" class="col">
        <mat-button-toggle-group formControlName="fuente" class="fuente">
          <mat-button-toggle value="CAJA_MAYOR">Caja mayor</mat-button-toggle>
          <mat-button-toggle value="CUENTA_BANCARIA" [disabled]="cuentas.length === 0">Cuenta bancaria</mat-button-toggle>
        </mat-button-toggle-group>

        <mat-form-field appearance="outline" *ngIf="!esBanco">
          <mat-label>Caja mayor</mat-label>
          <mat-select formControlName="cajaMayorId">
            <mat-option *ngFor="let c of cajas" [value]="c.id">{{ c.label }}</mat-option>
          </mat-select>
          <mat-error *ngIf="form.controls.cajaMayorId.hasError('required')">Requerido</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" *ngIf="esBanco">
          <mat-label>Cuenta bancaria</mat-label>
          <mat-select formControlName="cuentaBancariaId">
            <mat-option *ngFor="let c of cuentas" [value]="c.id">{{ c.label }}</mat-option>
          </mat-select>
          <mat-error *ngIf="form.controls.cuentaBancariaId.hasError('required')">Requerido</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Monto a cobrar</mat-label>
          <input matInput type="number" inputmode="decimal" formControlName="monto" min="0.01" step="any" />
          <mat-error *ngIf="form.controls.monto.hasError('required')">Requerido</mat-error>
          <mat-error *ngIf="form.controls.monto.hasError('min')">Debe ser mayor a 0</mat-error>
          <mat-error *ngIf="form.controls.monto.hasError('max')">No puede superar el saldo</mat-error>
        </mat-form-field>

        <p class="efectivo" *ngIf="!esBanco">Se cobra en <strong>{{ efectivoLabel }}</strong> hacia la caja mayor.</p>

        <mat-form-field appearance="outline">
          <mat-label>Observación (opcional)</mat-label>
          <input matInput formControlName="observacion" autocapitalize="characters" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(false)" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="cobrar()" [disabled]="saving || loading">Cobrar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .sub { margin: 0 0 4px; color: var(--text-primary); font-weight: 500; }
      .saldo { margin: 0 0 12px; color: var(--text-secondary); font-size: 0.85rem; }
      .efectivo { margin: 0 4px 8px; font-size: 0.8rem; color: var(--text-secondary); }
      .fuente { margin-bottom: 12px; }
      .col { display: flex; flex-direction: column; }
      .col mat-form-field { width: 100%; }
    `,
  ],
})
export class CobrarCpcDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly snack = inject(MatSnackBar);

  cajas: Opcion[] = [];
  cuentas: Opcion[] = [];
  private formaPagoId: number | null = null;
  efectivoLabel = 'Efectivo';
  loading = true;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    fuente: ['CAJA_MAYOR' as 'CAJA_MAYOR' | 'CUENTA_BANCARIA'],
    cajaMayorId: [null as number | null, Validators.required],
    cuentaBancariaId: [null as number | null],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    observacion: [''],
  });

  get esBanco(): boolean {
    return this.form.controls.fuente.value === 'CUENTA_BANCARIA';
  }

  constructor(
    public ref: MatDialogRef<CobrarCpcDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: CobrarCpcData,
  ) {}

  ngOnInit(): void {
    this.form.controls.monto.addValidators(Validators.max(this.data.saldo + 0.005));
    this.form.controls.fuente.valueChanges.subscribe((f) => this.aplicarValidadoresFuente(f));
    Promise.all([
      firstValueFrom(this.repo.getCajasMayor()),
      firstValueFrom(this.repo.getFormasPago()),
      firstValueFrom(this.repo.getCuentasBancarias()),
    ])
      .then(([cajas, formas, cuentas]: [any[], any[], any[]]) => {
        this.cajas = (cajas || [])
          .filter((c) => (c.estado || '').toUpperCase().includes('ABIERT'))
          .map((c) => ({ id: c.id, label: c.nombre || `Caja Mayor #${c.id}` }));
        this.cuentas = (cuentas || [])
          .filter((c) => c.activo !== false && c.moneda?.id === this.data.monedaId)
          .map((c) => ({ id: c.id, label: `${c.banco ? c.banco + ' · ' : ''}${c.nombre}` }));
        const efectivo = formaPagoEfectivo(formas || []);
        this.efectivoLabel = efectivo?.nombre || 'Efectivo';
        this.formaPagoId = efectivo?.id ?? null;
        if (this.cajas.length === 1) this.form.controls.cajaMayorId.setValue(this.cajas[0].id);
        if (this.cuentas.length === 1) this.form.controls.cuentaBancariaId.setValue(this.cuentas[0].id);
        this.form.controls.monto.setValue(this.data.saldo);
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar las cajas', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  private aplicarValidadoresFuente(f: 'CAJA_MAYOR' | 'CUENTA_BANCARIA'): void {
    const caja = this.form.controls.cajaMayorId;
    const cb = this.form.controls.cuentaBancariaId;
    if (f === 'CUENTA_BANCARIA') {
      cb.setValidators([Validators.required]);
      caja.clearValidators();
    } else {
      caja.setValidators([Validators.required]);
      cb.clearValidators();
    }
    caja.updateValueAndValidity();
    cb.updateValueAndValidity();
  }

  async cobrar(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const obs = v.observacion ? v.observacion.toUpperCase() : undefined;
    const payload = this.esBanco
      ? { cuotaId: this.data.cuotaId, montoCobrar: v.monto, fuente: 'CUENTA_BANCARIA', cuentaBancariaId: v.cuentaBancariaId, observacion: obs }
      : { cuotaId: this.data.cuotaId, montoCobrar: v.monto, fuente: 'CAJA_MAYOR', cajaMayorId: v.cajaMayorId, monedaId: this.data.monedaId, formaPagoId: this.formaPagoId, observacion: obs };
    try {
      await firstValueFrom(this.repo.cobrarCpcCuota(payload));
      this.snack.open('Cobro registrado', 'OK', { duration: 2500 });
      this.ref.close(true);
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw) ? 'Sin permiso para cobrar' : raw.replace(/^Error:\s*/, '') || 'No se pudo cobrar';
      this.snack.open(msg, 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}

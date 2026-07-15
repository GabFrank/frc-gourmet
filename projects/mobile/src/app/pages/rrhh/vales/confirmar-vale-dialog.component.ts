import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

export interface ConfirmarValeData {
  vale: any;
}

/** Payload devuelto por el diálogo para `confirmarVale(vale.id, payload)`. */
export interface ConfirmarValeResult {
  fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA';
  monedaId: number | null;
  cajaMayorId?: number | null;
  formaPagoId?: number | null;
  cuentaBancariaId?: number | null;
  montoCuentaBancaria: number | null;
}

interface Opcion {
  id: number;
  label: string;
}

/**
 * Diálogo para confirmar un vale SOLICITADO (pasa a CONFIRMADO y egresa de caja
 * o debita una cuenta bancaria). Elige la fuente del egreso; la moneda es la del
 * vale. En modo banco solo se ofrecen cuentas de la misma moneda (sin cotización).
 */
@Component({
  selector: 'app-confirmar-vale-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatButtonToggleModule, MatFormFieldModule, MatSelectModule, MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Confirmar vale</h2>
    <mat-dialog-content>
      <p class="cv-sub">{{ funcionarioNombre }} · {{ simbolo }} {{ vale?.monto | number: '1.0-2' }}</p>
      <mat-progress-bar *ngIf="loading" mode="indeterminate"></mat-progress-bar>

      <form [formGroup]="form" *ngIf="!loading">
        <mat-button-toggle-group formControlName="fuente" class="cv-fuente">
          <mat-button-toggle value="CAJA_MAYOR">Caja Mayor</mat-button-toggle>
          <mat-button-toggle value="CUENTA_BANCARIA" [disabled]="cuentasBancarias.length === 0">
            Cuenta bancaria
          </mat-button-toggle>
        </mat-button-toggle-group>

        <ng-container *ngIf="!esBanco">
          <mat-form-field appearance="outline" class="cv-field">
            <mat-label>Caja Mayor</mat-label>
            <mat-select formControlName="cajaMayorId">
              <mat-option *ngFor="let c of cajasMayor" [value]="c.id">{{ c.label }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="cv-field">
            <mat-label>Forma de pago</mat-label>
            <mat-select formControlName="formaPagoId">
              <mat-option *ngFor="let f of formasPago" [value]="f.id">{{ f.label }}</mat-option>
            </mat-select>
          </mat-form-field>
        </ng-container>

        <mat-form-field appearance="outline" class="cv-field" *ngIf="esBanco">
          <mat-label>Cuenta bancaria</mat-label>
          <mat-select formControlName="cuentaBancariaId">
            <mat-option *ngFor="let c of cuentasBancarias" [value]="c.id">{{ c.label }}</mat-option>
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || loading" (click)="aceptar()">
        Confirmar egreso
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .cv-sub {
        margin: 0 0 12px;
        color: var(--text-secondary);
        font-size: 0.85rem;
      }
      .cv-fuente {
        width: 100%;
        margin-bottom: 12px;
      }
      .cv-fuente mat-button-toggle {
        flex: 1;
      }
      .cv-field {
        width: 100%;
      }
    `,
  ],
})
export class ConfirmarValeDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);

  vale: any;
  funcionarioNombre = '';
  simbolo = '';
  monedaId: number | null = null;

  cajasMayor: Opcion[] = [];
  formasPago: Opcion[] = [];
  cuentasBancarias: Opcion[] = [];
  loading = true;

  readonly form = this.fb.nonNullable.group({
    fuente: ['CAJA_MAYOR' as 'CAJA_MAYOR' | 'CUENTA_BANCARIA', Validators.required],
    cajaMayorId: [null as number | null],
    formaPagoId: [null as number | null],
    cuentaBancariaId: [null as number | null],
  });

  constructor(
    public ref: MatDialogRef<ConfirmarValeDialogComponent, ConfirmarValeResult>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmarValeData,
  ) {
    this.vale = data?.vale;
  }

  get esBanco(): boolean {
    return this.form.controls.fuente.value === 'CUENTA_BANCARIA';
  }

  ngOnInit(): void {
    const p = this.vale?.funcionario?.persona;
    this.funcionarioNombre = p ? `${p.nombre || ''} ${p.apellido || ''}`.trim() : 'Funcionario';
    this.simbolo = this.vale?.moneda?.simbolo || '';
    this.monedaId = this.vale?.moneda?.id ?? null;

    this.form.controls.fuente.valueChanges.subscribe((v) => this.aplicarValidadores(v));
    this.aplicarValidadores('CAJA_MAYOR');
    this.cargar();
  }

  private aplicarValidadores(fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA'): void {
    const cm = this.form.controls.cajaMayorId;
    const fp = this.form.controls.formaPagoId;
    const cb = this.form.controls.cuentaBancariaId;
    if (fuente === 'CUENTA_BANCARIA') {
      cb.setValidators([Validators.required]);
      cm.clearValidators();
      fp.clearValidators();
    } else {
      cm.setValidators([Validators.required]);
      fp.setValidators([Validators.required]);
      cb.clearValidators();
    }
    [cm, fp, cb].forEach((c) => c.updateValueAndValidity({ emitEvent: false }));
  }

  private cargar(): void {
    Promise.all([
      firstValueFrom(this.repo.getCajasMayor()),
      firstValueFrom(this.repo.getFormasPago()),
      firstValueFrom(this.repo.getCuentasBancarias()),
    ])
      .then(([cajas, formas, cuentas]: [any[], any[], any[]]) => {
        this.cajasMayor = (cajas || [])
          .filter((c) => (c.estado || '').toUpperCase().includes('ABIERT'))
          .map((c) => ({ id: c.id, label: c.nombre || `Caja Mayor #${c.id}` }));
        this.formasPago = (formas || [])
          .filter((f) => f.activo !== false)
          .map((f) => ({ id: f.id, label: f.nombre }));
        // Solo cuentas de la misma moneda del vale (evita cotización).
        this.cuentasBancarias = (cuentas || [])
          .filter((c) => c.activo !== false && c.moneda?.id && (this.monedaId == null || c.moneda.id === this.monedaId))
          .map((c) => ({ id: c.id, label: `${c.banco ? c.banco + ' · ' : ''}${c.nombre} (${c.moneda?.simbolo || ''})` }));
        // Preselección de únicos.
        if (this.cajasMayor.length === 1) this.form.controls.cajaMayorId.setValue(this.cajasMayor[0].id);
        if (this.formasPago.length === 1) this.form.controls.formaPagoId.setValue(this.formasPago[0].id);
        if (this.cuentasBancarias.length === 1) this.form.controls.cuentaBancariaId.setValue(this.cuentasBancarias[0].id);
        this.loading = false;
      })
      .catch(() => (this.loading = false));
  }

  aceptar(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.ref.close({
      fuente: v.fuente,
      monedaId: this.monedaId,
      cajaMayorId: v.fuente === 'CAJA_MAYOR' ? v.cajaMayorId : null,
      formaPagoId: v.fuente === 'CAJA_MAYOR' ? v.formaPagoId : null,
      cuentaBancariaId: v.fuente === 'CUENTA_BANCARIA' ? v.cuentaBancariaId : null,
      montoCuentaBancaria: null,
    });
  }
}

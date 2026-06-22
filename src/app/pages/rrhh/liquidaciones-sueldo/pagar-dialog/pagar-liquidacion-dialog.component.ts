import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-pagar-liquidacion-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Pagar liquidacion</h2>
    <mat-dialog-content>
      <div class="info-row">
        <div class="info-item">
          <span class="lbl">Funcionario</span>
          <strong>{{ data.liquidacion?.funcionario?.persona?.nombre }} {{ data.liquidacion?.funcionario?.persona?.apellido || '' }}</strong>
        </div>
        <div class="info-item">
          <span class="lbl">Periodo</span>
          <strong>{{ data.liquidacion?.periodo }}</strong>
        </div>
        <div class="info-item">
          <span class="lbl">Total neto</span>
          <strong>{{ data.liquidacion?.totalNeto | number:'1.0-2' }} PYG</strong>
        </div>
      </div>
      <form [formGroup]="form">
        <mat-button-toggle-group formControlName="fuente" class="toggle">
          <mat-button-toggle value="CAJA_MAYOR">Caja Mayor</mat-button-toggle>
          <mat-button-toggle value="CUENTA_BANCARIA">Cuenta bancaria</mat-button-toggle>
        </mat-button-toggle-group>

        <div class="form-row" *ngIf="form.get('fuente')?.value === 'CAJA_MAYOR'">
          <mat-form-field appearance="outline">
            <mat-label>Caja mayor</mat-label>
            <mat-select formControlName="cajaMayorId">
              <mat-option *ngFor="let c of cajasMayor" [value]="c.id">{{ c.nombre }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Moneda</mat-label>
            <mat-select formControlName="monedaId">
              <mat-option *ngFor="let m of monedas" [value]="m.id">{{ m.denominacion }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Forma de pago</mat-label>
            <mat-select formControlName="formaPagoId">
              <mat-option *ngFor="let f of formasPago" [value]="f.id">{{ f.descripcion || f.nombre }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="form-row" *ngIf="form.get('fuente')?.value === 'CUENTA_BANCARIA'">
          <mat-form-field appearance="outline">
            <mat-label>Cuenta bancaria</mat-label>
            <mat-select formControlName="cuentaBancariaId">
              <mat-option *ngFor="let cb of cuentasBancarias" [value]="cb.id">
                {{ cb.nombre }} ({{ cb.moneda?.denominacion || cb.moneda?.simbolo }})
              </mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving">
        Pagar y descontar saldo
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .info-row { display: flex; flex-wrap: wrap; gap: 24px; padding: 8px 0 16px; }
    .info-item { display: flex; flex-direction: column; gap: 2px; }
    .info-item .lbl { font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.4px; }
    .info-item strong { font-size: 14px; }
    .toggle { margin: 0 0 12px; }
    .form-row { display: flex; gap: 12px; flex-wrap: nowrap; }
    .form-row mat-form-field { flex: 1 1 0; min-width: 0; }
    @media (max-width: 720px) {
      .form-row { flex-wrap: wrap; }
      .form-row mat-form-field { flex: 1 1 100%; }
    }
  `],
})
export class PagarLiquidacionDialogComponent implements OnInit {
  saving = false;
  form: FormGroup;
  cajasMayor: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  cuentasBancarias: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<PagarLiquidacionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { liquidacion: any },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      fuente: ['CAJA_MAYOR', Validators.required],
      cajaMayorId: [null],
      monedaId: [data.liquidacion?.monedaPago?.id || null],
      formaPagoId: [null],
      cuentaBancariaId: [null],
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const [cajasMayor, monedas, formasPago, cuentas] = await Promise.all([
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCuentasBancarias()),
      ]);
      this.cajasMayor = (cajasMayor || []).filter((c: any) => c.estado === 'ABIERTA');
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
      this.cuentasBancarias = ((cuentas as any[]) || []).filter((c: any) => c.activo !== false);
    } catch (e) {
      console.error(e);
    }

    this.form.get('fuente')!.valueChanges.subscribe(() => this.aplicarValidadoresFuente());
    this.aplicarValidadoresFuente();
  }

  private aplicarValidadoresFuente(): void {
    const fuente = this.form.get('fuente')!.value;
    const cm = this.form.get('cajaMayorId')!;
    const mon = this.form.get('monedaId')!;
    const fp = this.form.get('formaPagoId')!;
    const cb = this.form.get('cuentaBancariaId')!;
    if (fuente === 'CAJA_MAYOR') {
      cm.setValidators([Validators.required]);
      mon.setValidators([Validators.required]);
      fp.setValidators([Validators.required]);
      cb.clearValidators();
    } else {
      cm.clearValidators();
      mon.clearValidators();
      fp.clearValidators();
      cb.setValidators([Validators.required]);
    }
    cm.updateValueAndValidity({ emitEvent: false });
    mon.updateValueAndValidity({ emitEvent: false });
    fp.updateValueAndValidity({ emitEvent: false });
    cb.updateValueAndValidity({ emitEvent: false });
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const v = this.form.value;
      const payload: any = { fuente: v.fuente };
      if (v.fuente === 'CUENTA_BANCARIA') {
        payload.cuentaBancariaId = v.cuentaBancariaId;
      } else {
        payload.cajaMayorId = v.cajaMayorId;
        payload.monedaId = v.monedaId;
        payload.formaPagoId = v.formaPagoId;
      }
      await firstValueFrom(this.repositoryService.pagarLiquidacionSueldo(this.data.liquidacion.id, payload));
      this.snackBar.open('Liquidacion pagada y saldo descontado', 'Cerrar', { duration: 3000 });
      this.dialogRef.close({ saved: true });
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    } finally {
      this.saving = false;
    }
  }
}

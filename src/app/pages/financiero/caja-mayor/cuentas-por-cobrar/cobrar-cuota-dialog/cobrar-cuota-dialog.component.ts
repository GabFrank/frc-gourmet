import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { confirmarSaldosNegativos } from 'src/app/shared/utils/saldo-negativo-confirm';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

interface CobrarCuotaDialogData {
  cuota: any;
  contextoLabel?: string;
  cajaMayorId?: number;
}

@Component({
  selector: 'app-cobrar-cuota-dialog',
  templateUrl: './cobrar-cuota-dialog.component.html',
  styleUrls: ['./cobrar-cuota-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    CurrencyInputDirective,
  ]
})
export class CobrarCuotaDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;

  cuota: any = null;
  contextoLabel = '';
  restante = 0;
  decimalesMoneda = 0;

  cajasMayor: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  formasPagoEfectivo: any[] = [];
  cuentasBancarias: any[] = [];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<CobrarCuotaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: CobrarCuotaDialogData,
  ) {}

  ngOnInit(): void {
    this.cuota = this.data?.cuota;
    this.contextoLabel = this.data?.contextoLabel || '';
    this.restante = +(Number(this.cuota?.monto || 0) - Number(this.cuota?.montoCobrado || 0)).toFixed(2);

    this.form = this.fb.group({
      montoCobrar: [this.restante, [Validators.required, Validators.min(0.01)]],
      fuente: ['CAJA_MAYOR', Validators.required],
      cajaMayorId: [null, Validators.required],
      monedaId: [null, Validators.required],
      formaPagoId: [null, Validators.required],
      cuentaBancariaId: [null],
      observacion: [''],
    });

    this.loadLookups();
    this.form.get('monedaId')!.valueChanges.subscribe(() => this.recalcDecimalesMoneda());
    this.form.get('fuente')!.valueChanges.subscribe(() => this.aplicarValidadoresFuente());
  }

  /** CAJA_MAYOR: ingreso en efectivo a la caja; CUENTA_BANCARIA: acredita la cuenta. */
  private aplicarValidadoresFuente(): void {
    const esBanco = this.form.get('fuente')!.value === 'CUENTA_BANCARIA';
    const caja = this.form.get('cajaMayorId')!;
    const mon = this.form.get('monedaId')!;
    const fp = this.form.get('formaPagoId')!;
    const cb = this.form.get('cuentaBancariaId')!;
    if (esBanco) {
      caja.clearValidators();
      mon.clearValidators();
      fp.clearValidators();
      cb.setValidators([Validators.required]);
    } else {
      caja.setValidators([Validators.required]);
      mon.setValidators([Validators.required]);
      fp.setValidators([Validators.required]);
      cb.clearValidators();
    }
    caja.updateValueAndValidity({ emitEvent: false });
    mon.updateValueAndValidity({ emitEvent: false });
    fp.updateValueAndValidity({ emitEvent: false });
    cb.updateValueAndValidity({ emitEvent: false });
  }

  private recalcDecimalesMoneda(): void {
    const id = this.form?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    let dec: any = m?.decimales;
    if (dec == null) dec = this.cuota?.cuentaPorCobrar?.moneda?.decimales;
    this.decimalesMoneda = Number.isFinite(Number(dec)) ? Number(dec) : 0;
  }

  async loadLookups(): Promise<void> {
    try {
      const [cajas, monedas, formas, cuentas] = await Promise.all([
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCuentasBancarias()),
      ]);
      this.cajasMayor = (cajas || []).filter((c: any) => c.estado === 'ABIERTA');
      this.monedas = monedas || [];
      this.formasPago = (formas || []).filter((f: any) => f.movimentaCaja);
      this.formasPagoEfectivo = this.formasPago.filter((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO'));
      this.cuentasBancarias = ((cuentas as any[]) || []).filter((c: any) => c.activo !== false);
      this.applyPreSelecciones();
      this.recalcDecimalesMoneda();
    } catch (e) { console.error(e); }
  }

  private applyPreSelecciones(): void {
    // Caja Mayor: respeta data.cajaMayorId, sino única abierta.
    if (!this.form.get('cajaMayorId')?.value) {
      const targetCaja = this.data?.cajaMayorId
        ? this.cajasMayor.find(c => c.id === this.data!.cajaMayorId)
        : (this.cajasMayor.length === 1 ? this.cajasMayor[0] : null);
      if (targetCaja) this.form.patchValue({ cajaMayorId: targetCaja.id });
    }
    // Moneda: la de la CPC si existe, sino la principal, sino la única.
    if (!this.form.get('monedaId')?.value) {
      const monedaCpc = this.cuota?.cuentaPorCobrar?.moneda?.id;
      const principal = this.monedas.find((m: any) => m.principal);
      const targetMoneda = (monedaCpc && this.monedas.find((m: any) => m.id === monedaCpc))
        || principal
        || (this.monedas.length === 1 ? this.monedas[0] : null);
      if (targetMoneda) this.form.patchValue({ monedaId: targetMoneda.id });
    }
    // Forma de pago (caja = efectivo): la principal de efectivo, sino la única.
    if (!this.form.get('formaPagoId')?.value) {
      const principalFp = this.formasPagoEfectivo.find((f: any) => f.principal);
      const targetFp = principalFp || (this.formasPagoEfectivo.length >= 1 ? this.formasPagoEfectivo[0] : null);
      if (targetFp) this.form.patchValue({ formaPagoId: targetFp.id });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.cuota?.id) return;
    const f = this.form.value;
    const monto = Number(f.montoCobrar);
    if (monto > this.restante + 0.005) {
      this.snackBar.open(`Monto excede el restante (${this.restante})`, 'Cerrar', { duration: 3000 });
      return;
    }

    const esBanco = f.fuente === 'CUENTA_BANCARIA';

    // Verificar saldo negativo (solo aplica a Caja Mayor; el cobro es un ingreso,
    // así que en la práctica no baja, pero se mantiene el chequeo por consistencia).
    if (!esBanco) {
      const saldos: any[] = await firstValueFrom(this.repositoryService.getCajaMayorSaldos(f.cajaMayorId));
      const s = (saldos || []).find((x: any) => x.moneda?.id === f.monedaId && x.formaPago?.id === f.formaPagoId);
      const saldoActual = s ? Number(s.saldo) : 0;
      const cm = this.cajasMayor.find(c => c.id === f.cajaMayorId);
      const fp = this.formasPago.find(p => p.id === f.formaPagoId);
      const moneda = this.monedas.find(m => m.id === f.monedaId);
      const label = `${cm?.nombre || 'Caja Mayor'} (${moneda?.denominacion || ''} / ${fp?.nombre || ''})`;
      const ok = await confirmarSaldosNegativos(this.dialog, [{ label, saldoActual, monto, monedaSimbolo: moneda?.simbolo || '' }]);
      if (!ok) return;
    }

    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.cobrarCpcCuota({
        cuotaId: this.cuota.id,
        montoCobrar: monto,
        fuente: f.fuente,
        cajaMayorId: esBanco ? null : f.cajaMayorId,
        monedaId: esBanco ? null : f.monedaId,
        formaPagoId: esBanco ? null : f.formaPagoId,
        cuentaBancariaId: esBanco ? f.cuentaBancariaId : null,
        observacion: f.observacion || null,
      }));
      this.snackBar.open('Cobro registrado', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (e: any) {
      console.error(e);
      this.snackBar.open(e?.message || 'Error al registrar cobro', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void { this.dialogRef?.close(false); }
}

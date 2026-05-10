import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { confirmarSaldosNegativos, SaldoNegativoCheck } from 'src/app/shared/utils/saldo-negativo-confirm';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

@Component({
  selector: 'app-edit-movimiento-dialog',
  templateUrl: './edit-movimiento-dialog.component.html',
  styleUrls: ['./edit-movimiento-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    CurrencyInputDirective,
  ]
})
export class EditMovimientoDialogComponent implements OnInit {
  form!: FormGroup;
  monedas: any[] = [];
  formasPago: any[] = [];
  saving = false;
  decimalesMoneda = 0;
  movimientoId: number = 0;
  tipoMovimiento: string = '';
  cajaMayorId: number = 0;
  oldMonedaId: number | null = null;
  oldFormaPagoId: number | null = null;
  oldMonto = 0;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<EditMovimientoDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.movimientoId = this.data?.movimientoId || 0;
    this.tipoMovimiento = this.data?.tipoMovimiento || '';
    this.cajaMayorId = this.data?.cajaMayorId || 0;

    const detalle = this.data?.detalle;
    this.oldMonedaId = detalle?.monedaId || null;
    this.oldFormaPagoId = detalle?.formaPagoId || null;
    this.oldMonto = Number(detalle?.monto || 0);

    this.form = this.fb.group({
      monedaId: [detalle?.monedaId || null, Validators.required],
      formaPagoId: [detalle?.formaPagoId || null, Validators.required],
      monto: [detalle?.monto || null, [Validators.required, Validators.min(0.01)]],
      observacion: [this.data?.observacion || ''],
    });

    this.loadLookups();
    this.form.get('monedaId')!.valueChanges.subscribe(() => this.recalcDecimalesMoneda());
  }

  private recalcDecimalesMoneda(): void {
    const id = this.form?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  async loadLookups(): Promise<void> {
    try {
      const [monedas, formasPago] = await Promise.all([
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
      ]);
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
      this.recalcDecimalesMoneda();
    } catch (error) {
      console.error('Error loading lookups:', error);
    }
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;

    // Pre-validar saldos: el handler reverte el movimiento viejo y aplica el nuevo
    const ok = await this.confirmarSaldoSiNegativo();
    if (!ok) return;

    this.saving = true;
    try {
      const f = this.form.value;
      await firstValueFrom(this.repositoryService.editCajaMayorMovimiento(this.movimientoId, {
        monedaId: f.monedaId,
        formaPagoId: f.formaPagoId,
        monto: f.monto,
        observacion: f.observacion?.toUpperCase() || null,
      }));
      this.snackBar.open('Movimiento actualizado correctamente', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error) {
      console.error('Error editing movimiento:', error);
      this.snackBar.open('Error al actualizar movimiento', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  private esIngreso(tipo: string): boolean {
    return tipo.startsWith('INGRESO_') || tipo === 'TRANSFERENCIA_ENTRADA' || tipo === 'AJUSTE_POSITIVO';
  }

  // El handler edit-caja-mayor-movimiento reverte el movimiento viejo (con
  // moneda/fp/monto previos) y aplica el nuevo. Computar el delta neto por
  // (moneda, fp) y validar que ningun saldo quede negativo.
  private async confirmarSaldoSiNegativo(): Promise<boolean> {
    if (!this.cajaMayorId) return true;
    try {
      const f = this.form.value;
      const ingreso = this.esIngreso(this.tipoMovimiento);
      const sign = ingreso ? 1 : -1;

      // Delta neto por (moneda, fp): -sign*oldMonto en old, +sign*newMonto en new
      const deltas = new Map<string, number>();
      if (this.oldMonedaId && this.oldFormaPagoId) {
        const k = `${this.oldMonedaId}-${this.oldFormaPagoId}`;
        deltas.set(k, (deltas.get(k) || 0) - sign * this.oldMonto);
      }
      const kNew = `${f.monedaId}-${f.formaPagoId}`;
      deltas.set(kNew, (deltas.get(kNew) || 0) + sign * Number(f.monto));

      const saldos: any[] = await firstValueFrom(this.repositoryService.getCajaMayorSaldos(this.cajaMayorId));
      const checks: SaldoNegativoCheck[] = [];
      for (const [key, delta] of deltas.entries()) {
        if (Math.abs(delta) < 0.005) continue;
        const [monedaIdStr, formaPagoIdStr] = key.split('-');
        const monedaId = Number(monedaIdStr);
        const formaPagoId = Number(formaPagoIdStr);
        const s = (saldos || []).find(x => x.moneda?.id === monedaId && x.formaPago?.id === formaPagoId);
        const saldoActual = s ? Number(s.saldo) : 0;
        const moneda = this.monedas.find(m => m.id === monedaId);
        const fp = this.formasPago.find(p => p.id === formaPagoId);
        // confirmarSaldosNegativos espera "monto a debitar" positivo. Convertimos:
        // monto positivo = egreso. Si delta es negativo (saldo baja), monto a debitar = -delta.
        const monto = -delta;
        checks.push({
          label: `${moneda?.denominacion || ''} / ${fp?.nombre || ''}`,
          saldoActual,
          monto,
          monedaSimbolo: moneda?.simbolo || '',
        });
      }
      return confirmarSaldosNegativos(this.dialog, checks);
    } catch (e) {
      console.error('Error verificando saldo:', e);
      return true;
    }
  }

  cancel(): void {
    this.dialogRef?.close(false);
  }
}

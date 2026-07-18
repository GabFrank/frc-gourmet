import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
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

interface FilaEdicion {
  movimientoId: number;
  monedaId: number | null;
  formaPagoId: number | null;
  monto: number | null;
}

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
  // Movimiento de Caja Mayor = siempre efectivo (regla de negocio).
  formasPagoEfectivo: any[] = [];
  saving = false;
  // Decimales por fila (para la máscara de monto).
  decimalesFila: number[] = [];
  tipoMovimiento: string = '';
  cajaMayorId: number = 0;
  // Valores originales por fila (para validar saldos al revertir+aplicar).
  private oldRows: FilaEdicion[] = [];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<EditMovimientoDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  get rows(): FormArray {
    return this.form.get('rows') as FormArray;
  }

  get esMultiMoneda(): boolean {
    return this.rows.length > 1;
  }

  ngOnInit(): void {
    this.tipoMovimiento = this.data?.tipoMovimiento || '';
    this.cajaMayorId = this.data?.cajaMayorId || 0;

    // `detalles` (multi-moneda, ej. egreso de caja inicial) o el `detalle` único
    // (retrocompatible). Cada fila edita un CajaMayorMovimiento por su id.
    const detalles: FilaEdicion[] = (this.data?.detalles && this.data.detalles.length)
      ? this.data.detalles.map((d: any) => ({
          movimientoId: d.movimientoId,
          monedaId: d.monedaId ?? null,
          formaPagoId: d.formaPagoId ?? null,
          monto: d.monto ?? null,
        }))
      : [{
          movimientoId: this.data?.movimientoId,
          monedaId: this.data?.detalle?.monedaId ?? null,
          formaPagoId: this.data?.detalle?.formaPagoId ?? null,
          monto: this.data?.detalle?.monto ?? null,
        }];

    this.oldRows = detalles.map(d => ({ ...d, monto: Number(d.monto || 0) }));
    this.decimalesFila = detalles.map(() => 0);

    this.form = this.fb.group({
      rows: this.fb.array(detalles.map(d => this.fb.group({
        movimientoId: [d.movimientoId],
        monedaId: [d.monedaId, Validators.required],
        formaPagoId: [d.formaPagoId, Validators.required],
        monto: [d.monto, [Validators.required, Validators.min(0.01)]],
      }))),
      observacion: [this.data?.observacion || ''],
    });

    this.loadLookups();
    this.rows.controls.forEach((row, i) => {
      row.get('monedaId')!.valueChanges.subscribe(() => this.recalcDecimalesFila(i));
    });
  }

  private recalcDecimalesFila(index: number): void {
    const id = this.rows.at(index)?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesFila[index] = Number.isFinite(dec) ? dec : 0;
  }

  async loadLookups(): Promise<void> {
    try {
      const [monedas, formasPago] = await Promise.all([
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
      ]);
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
      // El select de forma de pago (Caja Mayor) solo ofrece efectivo.
      this.formasPagoEfectivo = this.formasPago.filter((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO'));
      this.rows.controls.forEach((_row, i) => this.recalcDecimalesFila(i));
    } catch (error) {
      console.error('Error loading lookups:', error);
    }
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Completá los campos obligatorios de cada moneda.', 'Cerrar', { duration: 3500 });
      return;
    }

    // Pre-validar saldos: el handler reverte el movimiento viejo y aplica el nuevo.
    const ok = await this.confirmarSaldoSiNegativo();
    if (!ok) return;

    this.saving = true;
    try {
      const obs = this.form.value.observacion?.toUpperCase() || null;
      // Editar todas las monedas en UNA transacción (atómico: o todas o ninguna),
      // así un fallo a mitad no deja el grupo (ej. egreso inicial) parcialmente editado.
      const ediciones = this.rows.value.map((r: any) => ({
        movimientoId: r.movimientoId,
        monedaId: r.monedaId,
        formaPagoId: r.formaPagoId,
        monto: r.monto,
        observacion: obs,
      }));
      await firstValueFrom(this.repositoryService.editCajaMayorMovimientos(ediciones));
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
  // (moneda, fp) sobre TODAS las filas y validar que ningún saldo quede negativo.
  private async confirmarSaldoSiNegativo(): Promise<boolean> {
    if (!this.cajaMayorId) return true;
    try {
      const ingreso = this.esIngreso(this.tipoMovimiento);
      const sign = ingreso ? 1 : -1;

      const deltas = new Map<string, number>();
      // Revertir todos los viejos.
      for (const old of this.oldRows) {
        if (old.monedaId && old.formaPagoId) {
          const k = `${old.monedaId}-${old.formaPagoId}`;
          deltas.set(k, (deltas.get(k) || 0) - sign * Number(old.monto || 0));
        }
      }
      // Aplicar todos los nuevos.
      for (const nueva of this.rows.value) {
        const k = `${nueva.monedaId}-${nueva.formaPagoId}`;
        deltas.set(k, (deltas.get(k) || 0) + sign * Number(nueva.monto || 0));
      }

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
        const monto = -delta; // monto a debitar positivo = egreso
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

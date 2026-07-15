import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ConfirmDialogComponent, ConfirmData } from '../../../../core/components/confirm-dialog.component';

interface Opcion {
  id: number;
  label: string;
}

interface CuentaOpcion extends Opcion {
  monedaId: number;
  simbolo: string;
  decimales: number;
}

/**
 * Ingreso / Egreso genérico de Caja Mayor (ajuste positivo o negativo) —
 * operación full-screen. El signo viene en la ruta (:signo = ingreso|egreso).
 *
 * Fuente CAJA_MAYOR → movimiento AJUSTE_POSITIVO / AJUSTE_NEGATIVO. Fuente
 * CUENTA_BANCARIA → movimiento bancario manual ENTRADA_MANUAL / SALIDA_MANUAL
 * (la moneda la dicta la cuenta). En egreso desde caja se pide confirmación si
 * el saldo quedaría negativo, replicando el escritorio.
 */
@Component({
  selector: 'app-ajuste-nuevo',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './ajuste-nuevo.page.html',
  styles: [
    `
      .an-fuente {
        align-self: stretch;
        margin-bottom: 4px;
      }
      .an-fuente mat-button-toggle {
        flex: 1;
      }
      .an-hint {
        margin: 0 4px 8px;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class AjusteNuevoPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  cajaMayorId = 0;
  esIngreso = true;

  monedas: Opcion[] = [];
  formasPago: Opcion[] = [];
  cuentasBancarias: CuentaOpcion[] = [];
  loading = true;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    fuente: ['CAJA_MAYOR' as 'CAJA_MAYOR' | 'CUENTA_BANCARIA', Validators.required],
    monedaId: [null as number | null, Validators.required],
    formaPagoId: [null as number | null],
    cuentaBancariaId: [null as number | null],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    motivo: ['', Validators.required],
  });

  get titulo(): string {
    return this.esIngreso ? 'Ajuste positivo' : 'Ajuste negativo';
  }

  get esBanco(): boolean {
    return this.form.controls.fuente.value === 'CUENTA_BANCARIA';
  }

  ngOnInit(): void {
    this.cajaMayorId = Number(this.route.snapshot.paramMap.get('id'));
    this.esIngreso = this.route.snapshot.paramMap.get('signo') === 'ingreso';
    this.form.controls.fuente.valueChanges.subscribe((v) => this.aplicarValidadoresFuente(v));
    this.aplicarValidadoresFuente('CAJA_MAYOR');
    this.cargarCatalogos();
  }

  private aplicarValidadoresFuente(fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA'): void {
    const fp = this.form.controls.formaPagoId;
    const cb = this.form.controls.cuentaBancariaId;
    const mon = this.form.controls.monedaId;
    if (fuente === 'CUENTA_BANCARIA') {
      cb.setValidators([Validators.required]);
      fp.clearValidators();
      fp.setValue(null, { emitEvent: false });
      if (cb.value) this.alinearMonedaConCuenta(cb.value);
      mon.disable({ emitEvent: false });
    } else {
      fp.setValidators([Validators.required]);
      cb.clearValidators();
      cb.setValue(null, { emitEvent: false });
      mon.enable({ emitEvent: false });
    }
    fp.updateValueAndValidity({ emitEvent: false });
    cb.updateValueAndValidity({ emitEvent: false });
  }

  onCuentaBancariaSelected(cuentaId: number): void {
    this.alinearMonedaConCuenta(cuentaId);
  }

  private alinearMonedaConCuenta(cuentaId: number): void {
    const c = this.cuentasBancarias.find((x) => x.id === cuentaId);
    if (c) this.form.controls.monedaId.setValue(c.monedaId, { emitEvent: false });
  }

  private cargarCatalogos(): void {
    this.loading = true;
    Promise.all([
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getFormasPago()),
      firstValueFrom(this.repo.getCuentasBancarias()),
    ])
      .then(([monedas, formas, cuentas]: [any[], any[], any[]]) => {
        this.monedas = (monedas || [])
          .filter((m) => m.activo !== false)
          .map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        this.formasPago = (formas || [])
          .filter((f) => f.activo !== false)
          .map((f) => ({ id: f.id, label: f.nombre }));
        this.cuentasBancarias = (cuentas || [])
          .filter((c) => c.activo !== false && c.moneda?.id)
          .map((c) => ({
            id: c.id,
            label: `${c.banco ? c.banco + ' · ' : ''}${c.nombre} (${c.moneda?.simbolo || ''})`,
            monedaId: c.moneda.id,
            simbolo: c.moneda?.simbolo || '',
            decimales: c.moneda?.decimales ?? 0,
          }));
        const principal = (monedas || []).find((m) => m.principal);
        if (principal) this.form.controls.monedaId.setValue(principal.id);
        else if (this.monedas.length === 1) this.form.controls.monedaId.setValue(this.monedas[0].id);
        if (this.formasPago.length === 1) this.form.controls.formaPagoId.setValue(this.formasPago[0].id);
        if (this.cuentasBancarias.length === 1) this.form.controls.cuentaBancariaId.setValue(this.cuentasBancarias[0].id);
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar los catálogos', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  volver(): void {
    this.location.back();
  }

  /**
   * Si es egreso desde caja mayor y el saldo (moneda + forma de pago) quedaría
   * negativo, pide confirmación. Devuelve true si se puede continuar.
   */
  private async confirmarSaldoSiNegativo(monedaId: number, formaPagoId: number, monto: number): Promise<boolean> {
    let saldos: any[] = [];
    try {
      saldos = (await firstValueFrom(this.repo.getCajaMayorSaldos(this.cajaMayorId))) || [];
    } catch {
      return true; // si no se puede leer el saldo, no bloqueamos la operación
    }
    const s = saldos.find((x) => x.moneda?.id === monedaId && x.formaPago?.id === formaPagoId);
    const actual = Number(s?.saldo) || 0;
    const resultante = actual - monto;
    if (resultante >= 0) return true;
    const simbolo = s?.moneda?.simbolo || '';
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'Saldo negativo',
            message: `El saldo quedará en ${simbolo} ${resultante.toLocaleString()}. ¿Continuar igual?`,
            confirmText: 'Continuar',
            danger: true,
          } as ConfirmData,
          width: '340px',
        })
        .afterClosed(),
    );
    return !!ok;
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const monto = Number(v.monto);

    // Rama CUENTA_BANCARIA → movimiento bancario manual.
    if (v.fuente === 'CUENTA_BANCARIA') {
      this.saving = true;
      const payload = {
        cuentaBancariaId: v.cuentaBancariaId,
        tipoMovimiento: this.esIngreso ? 'ENTRADA_MANUAL' : 'SALIDA_MANUAL',
        monto,
        fecha: new Date(),
        observacion: (v.motivo || '').toUpperCase(),
        numeroComprobante: null,
      };
      try {
        await firstValueFrom(this.repo.createMovimientoBancario(payload));
        this.snack.open('Movimiento registrado', 'OK', { duration: 2500 });
        this.location.back();
      } catch (e) {
        this.mostrarError(e);
        this.saving = false;
      }
      return;
    }

    // Rama CAJA_MAYOR → ajuste. Egreso: confirmar saldo negativo.
    if (!this.esIngreso) {
      const ok = await this.confirmarSaldoSiNegativo(v.monedaId as number, v.formaPagoId as number, monto);
      if (!ok) return;
    }
    this.saving = true;
    const payload = {
      cajaMayor: { id: this.cajaMayorId },
      moneda: { id: v.monedaId },
      formaPago: { id: v.formaPagoId },
      monto,
      tipoMovimiento: this.esIngreso ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
      observacion: (v.motivo || '').toUpperCase(),
    };
    try {
      await firstValueFrom(this.repo.createCajaMayorMovimiento(payload));
      this.snack.open('Ajuste registrado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      this.mostrarError(e);
      this.saving = false;
    }
  }

  private mostrarError(e: unknown): void {
    const raw = String((e as Error)?.message || '');
    const msg = /PERMISO/.test(raw)
      ? 'Sin permiso para operar'
      : raw.replace(/^Error:\s*/, '') || 'No se pudo registrar';
    this.snack.open(msg, 'OK', { duration: 3500 });
  }
}

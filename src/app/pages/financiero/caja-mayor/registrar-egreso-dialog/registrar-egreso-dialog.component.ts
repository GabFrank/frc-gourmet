import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { confirmarSaldosNegativos } from 'src/app/shared/utils/saldo-negativo-confirm';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CreateEditGastoDialogComponent } from '../gastos/create-edit-gasto/create-edit-gasto-dialog.component';
import { CreateOperacionFinancieraDialogComponent } from '../operaciones-financieras/create-operacion-financiera/create-operacion-financiera-dialog.component';
import { EmitirChequeDialogComponent } from '../cheques/emitir-cheque/emitir-cheque-dialog.component';
import { PagarComprasDialogComponent } from '../pagar-compras-dialog/pagar-compras-dialog.component';
import { CreateEditValeDialogComponent } from 'src/app/pages/rrhh/vales/create-edit-vale-dialog.component';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

type EgresoTipo = 'GASTO' | 'AJUSTE' | 'OPERACION_FINANCIERA' | 'EMITIR_CHEQUE' | 'PAGAR_COMPRAS' | 'REGISTRAR_VALE' | null;

@Component({
  selector: 'app-registrar-egreso-dialog',
  templateUrl: './registrar-egreso-dialog.component.html',
  styleUrls: ['./registrar-egreso-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    CurrencyInputDirective,
  ]
})
export class RegistrarEgresoDialogComponent implements OnInit {
  tipoSeleccionado: EgresoTipo = null;
  ajusteForm!: FormGroup;
  monedas: any[] = [];
  formasPago: any[] = [];
  formasPagoEfectivo: any[] = [];
  cuentasBancarias: any[] = [];
  saving = false;
  loading = true;
  cajaMayorId: number = 0;
  decimalesMoneda = 0;

  tiposEgreso = [
    {
      tipo: 'PAGAR_COMPRAS' as EgresoTipo,
      titulo: 'Pagar Compras',
      descripcion: 'Pagar una o varias cuotas pendientes de compras (contado o crédito)',
      icono: 'shopping_cart_checkout',
      color: '#1565c0',
    },
    {
      tipo: 'GASTO' as EgresoTipo,
      titulo: 'Gasto',
      descripcion: 'Registrar un gasto categorizado (servicios, operativo, etc.)',
      icono: 'receipt_long',
      color: '#e65100',
    },
    {
      tipo: 'OPERACION_FINANCIERA' as EgresoTipo,
      titulo: 'Operacion Financiera',
      descripcion: 'Cambio de divisa, deposito bancario, transferencia entre cajas',
      icono: 'swap_horiz',
      color: '#6a1b9a',
    },
    {
      tipo: 'EMITIR_CHEQUE' as EgresoTipo,
      titulo: 'Emitir Cheque',
      descripcion: 'Emitir cheque propio (a la vista o diferido)',
      icono: 'request_quote',
      color: '#0d47a1',
    },
    {
      tipo: 'REGISTRAR_VALE' as EgresoTipo,
      titulo: 'Registrar Vale',
      descripcion: 'Vale / adelanto a funcionario (confirma y egresa de Caja Mayor al toque)',
      icono: 'receipt_long',
      color: '#2e7d32',
    },
    {
      tipo: 'AJUSTE' as EgresoTipo,
      titulo: 'Ajuste de Saldo',
      descripcion: 'Egreso manual con motivo (faltante, correccion, etc.)',
      icono: 'tune',
      color: '#f44336',
    },
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<RegistrarEgresoDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaMayorId = this.data?.cajaMayorId || 0;
    this.ajusteForm = this.fb.group({
      fuente: ['CAJA_MAYOR', Validators.required],
      moneda: [null, Validators.required],
      formaPago: [null, Validators.required],
      cuentaBancariaId: [null],
      monto: [null, [Validators.required, Validators.min(0.01)]],
      motivo: ['', Validators.required],
    });
    this.ajusteForm.get('moneda')!.valueChanges.subscribe(() => this.recalcDecimalesMoneda());
    this.ajusteForm.get('fuente')!.valueChanges.subscribe(() => this.aplicarValidadoresFuente());
    this.loadData();
  }

  /** En CAJA_MAYOR se opera solo con efectivo; en CUENTA_BANCARIA se elige la cuenta. */
  private aplicarValidadoresFuente(): void {
    const fuente = this.ajusteForm.get('fuente')!.value;
    const moneda = this.ajusteForm.get('moneda')!;
    const formaPago = this.ajusteForm.get('formaPago')!;
    const cb = this.ajusteForm.get('cuentaBancariaId')!;
    if (fuente === 'CUENTA_BANCARIA') {
      moneda.clearValidators();
      formaPago.clearValidators();
      cb.setValidators([Validators.required]);
    } else {
      moneda.setValidators([Validators.required]);
      formaPago.setValidators([Validators.required]);
      cb.clearValidators();
      this.preseleccionarEfectivo();
    }
    moneda.updateValueAndValidity({ emitEvent: false });
    formaPago.updateValueAndValidity({ emitEvent: false });
    cb.updateValueAndValidity({ emitEvent: false });
  }

  private preseleccionarEfectivo(): void {
    if (this.formasPagoEfectivo.length === 1) {
      this.ajusteForm.get('formaPago')!.setValue(this.formasPagoEfectivo[0].id, { emitEvent: false });
    }
  }

  private recalcDecimalesMoneda(): void {
    const id = this.ajusteForm?.get('moneda')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [monedas, formasPago, cuentas] = await Promise.all([
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCuentasBancarias()),
      ]);
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
      this.formasPagoEfectivo = this.formasPago.filter((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO'));
      this.cuentasBancarias = ((cuentas as any[]) || []).filter((c: any) => c.activo !== false);
      this.preseleccionarEfectivo();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.loading = false;
    }
  }

  seleccionarTipo(tipo: EgresoTipo): void {
    if (tipo === 'GASTO') {
      this.dialogRef?.close(false);
      this.dialog.open(CreateEditGastoDialogComponent, {
        width: '700px',
        data: { cajaMayorId: this.cajaMayorId },
      });
      return;
    }
    if (tipo === 'OPERACION_FINANCIERA') {
      this.dialogRef?.close(false);
      this.dialog.open(CreateOperacionFinancieraDialogComponent, {
        width: '900px',
        maxHeight: '90vh',
        data: { cajaMayorId: this.cajaMayorId },
      });
      return;
    }
    if (tipo === 'EMITIR_CHEQUE') {
      this.dialogRef?.close(false);
      this.dialog.open(EmitirChequeDialogComponent, {
        width: '720px',
        data: { cajaMayorId: this.cajaMayorId },
      });
      return;
    }
    if (tipo === 'PAGAR_COMPRAS') {
      this.dialogRef?.close(false);
      this.dialog.open(PagarComprasDialogComponent, {
        width: '900px',
        maxWidth: '95vw',
        data: { cajaMayorId: this.cajaMayorId },
      });
      return;
    }
    if (tipo === 'REGISTRAR_VALE') {
      this.dialogRef?.close(false);
      this.dialog.open(CreateEditValeDialogComponent, {
        width: '760px',
        maxWidth: '95vw',
        data: { cajaMayorId: this.cajaMayorId, modoConfirmar: true },
      });
      return;
    }
    this.tipoSeleccionado = tipo;
  }

  volver(): void {
    this.tipoSeleccionado = null;
  }

  async guardarAjuste(): Promise<void> {
    if (this.ajusteForm.invalid) return;

    const form = this.ajusteForm.value;
    const monto = Number(form.monto);
    const esBanco = form.fuente === 'CUENTA_BANCARIA';

    // Saldo negativo: pre-validar y confirmar (solo aplica a caja mayor en efectivo).
    if (!esBanco) {
      const ok = await this.confirmarSaldoSiNegativo(form.moneda, form.formaPago, monto);
      if (!ok) return;
    }

    this.saving = true;
    try {
      if (esBanco) {
        await firstValueFrom(this.repositoryService.createMovimientoBancario({
          cuentaBancariaId: form.cuentaBancariaId,
          tipoMovimiento: 'SALIDA_MANUAL',
          monto,
          fecha: new Date(),
          observacion: form.motivo.toUpperCase(),
          numeroComprobante: null,
        }));
      } else {
        await firstValueFrom(this.repositoryService.createCajaMayorMovimiento({
          cajaMayor: { id: this.cajaMayorId },
          tipoMovimiento: 'AJUSTE_NEGATIVO',
          moneda: { id: form.moneda },
          formaPago: { id: form.formaPago },
          monto,
          observacion: form.motivo.toUpperCase(),
        }));
      }
      this.snackBar.open('Egreso registrado correctamente', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error) {
      console.error('Error registrando egreso:', error);
      this.snackBar.open('Error al registrar egreso', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  private async confirmarSaldoSiNegativo(monedaId: number, formaPagoId: number, monto: number): Promise<boolean> {
    try {
      const saldos: any[] = await firstValueFrom(this.repositoryService.getCajaMayorSaldos(this.cajaMayorId));
      const s = (saldos || []).find(x => x.moneda?.id === monedaId && x.formaPago?.id === formaPagoId);
      const saldoActual = s ? Number(s.saldo) : 0;
      const moneda = this.monedas.find(m => m.id === monedaId);
      const fp = this.formasPago.find(p => p.id === formaPagoId);
      return confirmarSaldosNegativos(this.dialog, [{
        label: `${moneda?.denominacion || ''} / ${fp?.nombre || ''}`,
        saldoActual,
        monto,
        monedaSimbolo: moneda?.simbolo || '',
      }]);
    } catch (e) {
      console.error('Error verificando saldo:', e);
      return true;
    }
  }

  cancel(): void {
    this.dialogRef?.close(false);
  }
}

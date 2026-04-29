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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CreateEditGastoDialogComponent } from '../gastos/create-edit-gasto/create-edit-gasto-dialog.component';
import { CreateOperacionFinancieraDialogComponent } from '../operaciones-financieras/create-operacion-financiera/create-operacion-financiera-dialog.component';
import { EmitirChequeDialogComponent } from '../cheques/emitir-cheque/emitir-cheque-dialog.component';

type EgresoTipo = 'GASTO' | 'AJUSTE' | 'OPERACION_FINANCIERA' | 'EMITIR_CHEQUE' | null;

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
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
  ]
})
export class RegistrarEgresoDialogComponent implements OnInit {
  tipoSeleccionado: EgresoTipo = null;
  ajusteForm!: FormGroup;
  monedas: any[] = [];
  formasPago: any[] = [];
  saving = false;
  loading = true;
  cajaMayorId: number = 0;

  tiposEgreso = [
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
      moneda: [null, Validators.required],
      formaPago: [null, Validators.required],
      monto: [null, [Validators.required, Validators.min(0.01)]],
      motivo: ['', Validators.required],
    });
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [monedas, formasPago] = await Promise.all([
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
      ]);
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
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
    this.tipoSeleccionado = tipo;
  }

  volver(): void {
    this.tipoSeleccionado = null;
  }

  async guardarAjuste(): Promise<void> {
    if (this.ajusteForm.invalid) return;

    const form = this.ajusteForm.value;
    const monto = Number(form.monto);

    // Saldo negativo: pre-validar y confirmar
    const ok = await this.confirmarSaldoSiNegativo(form.moneda, form.formaPago, monto);
    if (!ok) return;

    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.createCajaMayorMovimiento({
        cajaMayor: { id: this.cajaMayorId },
        tipoMovimiento: 'AJUSTE_NEGATIVO',
        moneda: { id: form.moneda },
        formaPago: { id: form.formaPago },
        monto,
        observacion: form.motivo.toUpperCase(),
      }));
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

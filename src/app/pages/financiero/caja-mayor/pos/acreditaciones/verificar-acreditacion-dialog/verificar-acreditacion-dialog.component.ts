import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { confirmarSaldosNegativos } from 'src/app/shared/utils/saldo-negativo-confirm';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

@Component({
  selector: 'app-verificar-acreditacion-dialog',
  templateUrl: './verificar-acreditacion-dialog.component.html',
  styleUrls: ['./verificar-acreditacion-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    CurrencyInputDirective,
  ]
})
export class VerificarAcreditacionDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  acreditacion: any = null;
  diferencia = 0;
  decimalesMoneda = 0;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<VerificarAcreditacionDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.acreditacion = this.data?.acreditacion;
    const sugerido = Number(this.acreditacion?.montoEsperado || 0);
    const dec = Number(this.acreditacion?.cuentaBancaria?.moneda?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
    this.form = this.fb.group({
      montoAcreditado: [sugerido, [Validators.required, Validators.min(0)]],
    });

    this.form.get('montoAcreditado')!.valueChanges.subscribe(v => {
      this.diferencia = +(Number(v || 0) - Number(this.acreditacion?.montoEsperado || 0)).toFixed(2);
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.acreditacion?.id) return;

    // Si el ajuste de la diferencia dejaria la cuenta bancaria en negativo, confirmar.
    // Logica del backend (verificar-acreditacion-pos):
    //  - Si ya fue ACREDITADO_AUTO: cb.saldo += diferencia (puede ser +/-)
    //  - Si no: cb.saldo += montoReal (siempre +)
    // Solo el primer caso puede dejar saldo negativo.
    const yaAcreditado = this.acreditacion.estado === 'ACREDITADO_AUTO';
    if (yaAcreditado && this.diferencia < 0) {
      const cb = this.acreditacion.cuentaBancaria;
      const saldoActual = cb ? Number(cb.saldo) : 0;
      const ok = await confirmarSaldosNegativos(this.dialog, [{
        label: `${cb?.nombre || 'Cuenta Bancaria'} (${cb?.moneda?.denominacion || ''})`,
        saldoActual,
        monto: Math.abs(this.diferencia),
        monedaSimbolo: cb?.moneda?.simbolo || '',
      }]);
      if (!ok) return;
    }

    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.verificarAcreditacionPos(
        this.acreditacion.id,
        Number(this.form.value.montoAcreditado),
      ));
      this.snackBar.open('Acreditacion verificada', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al verificar', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void { this.dialogRef?.close(false); }
}

import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatRadioModule } from '@angular/material/radio';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { confirmarSaldosNegativos } from 'src/app/shared/utils/saldo-negativo-confirm';

@Component({
  selector: 'app-crear-movimiento-bancario-dialog',
  templateUrl: './crear-movimiento-bancario-dialog.component.html',
  styleUrls: ['./crear-movimiento-bancario-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatRadioModule,
  ]
})
export class CrearMovimientoBancarioDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  cuentaBancaria: any;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<CrearMovimientoBancarioDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    this.cuentaBancaria = data?.cuentaBancaria;
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      tipoMovimiento: ['ENTRADA_MANUAL', Validators.required],
      monto: [null, [Validators.required, Validators.min(0.01)]],
      fecha: [new Date(), Validators.required],
      observacion: ['', Validators.required],
      numeroComprobante: [''],
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const esEgreso = v.tipoMovimiento === 'SALIDA_MANUAL' || v.tipoMovimiento === 'AJUSTE_NEGATIVO';

    if (esEgreso) {
      const ok = await confirmarSaldosNegativos(this.dialog, [{
        label: `Cuenta ${this.cuentaBancaria.nombre} (${this.cuentaBancaria.banco})`,
        saldoActual: Number(this.cuentaBancaria.saldo || 0),
        monto: Number(v.monto),
        monedaSimbolo: this.cuentaBancaria.moneda?.simbolo || '',
      }]);
      if (!ok) return;
    }

    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.createMovimientoBancario({
        cuentaBancariaId: this.cuentaBancaria.id,
        tipoMovimiento: v.tipoMovimiento,
        monto: v.monto,
        fecha: v.fecha,
        observacion: v.observacion,
        numeroComprobante: v.numeroComprobante || null,
      }));
      this.snackBar.open('Movimiento registrado', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error: any) {
      console.error('Error creating movimiento bancario:', error);
      this.snackBar.open(error?.message || 'Error al registrar movimiento', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    this.dialogRef?.close();
  }
}

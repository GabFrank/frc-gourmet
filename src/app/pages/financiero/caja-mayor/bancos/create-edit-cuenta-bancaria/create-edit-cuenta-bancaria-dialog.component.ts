import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

@Component({
  selector: 'app-create-edit-cuenta-bancaria-dialog',
  templateUrl: './create-edit-cuenta-bancaria-dialog.component.html',
  styleUrls: ['./create-edit-cuenta-bancaria-dialog.component.scss'],
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
export class CreateEditCuentaBancariaDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  isEditing = false;
  cuentaId: number | null = null;
  monedas: any[] = [];
  tipoCuentaOptions = ['CORRIENTE', 'AHORRO'];
  decimalesMoneda = 0;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CreateEditCuentaBancariaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cuentaId = this.data?.cuentaBancariaId || null;
    this.isEditing = !!this.cuentaId;

    this.form = this.fb.group({
      nombre: ['', Validators.required],
      banco: ['', Validators.required],
      numeroCuenta: ['', Validators.required],
      tipoCuenta: ['CORRIENTE', Validators.required],
      monedaId: [null, Validators.required],
      titular: [''],
      alias: [''],
      saldo: [0, [Validators.required, Validators.min(0)]],
      activo: [true],
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
      const monedas = await firstValueFrom(this.repositoryService.getMonedas());
      this.monedas = monedas || [];
      this.recalcDecimalesMoneda();
      if (this.isEditing && this.cuentaId) {
        const cuenta = await firstValueFrom(this.repositoryService.getCuentaBancaria(this.cuentaId));
        if (cuenta) {
          this.form.patchValue({
            nombre: cuenta.nombre,
            banco: cuenta.banco,
            numeroCuenta: cuenta.numeroCuenta,
            tipoCuenta: cuenta.tipoCuenta,
            monedaId: cuenta.moneda?.id,
            titular: cuenta.titular || '',
            alias: cuenta.alias || '',
            saldo: Number(cuenta.saldo),
            activo: cuenta.activo,
          });
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const f = this.form.value;
      const data: any = {
        nombre: f.nombre,
        banco: f.banco,
        numeroCuenta: f.numeroCuenta,
        tipoCuenta: f.tipoCuenta,
        moneda: { id: f.monedaId },
        titular: f.titular || null,
        alias: f.alias || null,
        saldo: f.saldo,
        activo: f.activo,
      };
      if (this.isEditing && this.cuentaId) {
        await firstValueFrom(this.repositoryService.updateCuentaBancaria(this.cuentaId, data));
        this.snackBar.open('Cuenta actualizada', 'Cerrar', { duration: 3000 });
      } else {
        await firstValueFrom(this.repositoryService.createCuentaBancaria(data));
        this.snackBar.open('Cuenta creada', 'Cerrar', { duration: 3000 });
      }
      this.dialogRef?.close(true);
    } catch (error) {
      console.error('Error saving:', error);
      this.snackBar.open('Error al guardar', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void {
    this.dialogRef?.close(false);
  }
}

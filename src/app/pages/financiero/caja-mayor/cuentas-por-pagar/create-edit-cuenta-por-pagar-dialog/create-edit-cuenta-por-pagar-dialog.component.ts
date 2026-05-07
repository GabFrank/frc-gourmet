import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

@Component({
  selector: 'app-create-edit-cuenta-por-pagar-dialog',
  templateUrl: './create-edit-cuenta-por-pagar-dialog.component.html',
  styleUrls: ['./create-edit-cuenta-por-pagar-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    CurrencyInputDirective,
  ]
})
export class CreateEditCuentaPorPagarDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  monedas: any[] = [];
  proveedores: any[] = [];
  tipoOptions = ['COMPRA', 'PRESTAMO', 'OTRO'];
  decimalesMoneda = 0;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CreateEditCuentaPorPagarDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      descripcion: ['', Validators.required],
      tipo: ['OTRO', Validators.required],
      proveedorId: [null],
      montoTotal: [null, [Validators.required, Validators.min(0.01)]],
      monedaId: [null, Validators.required],
      fechaInicio: [new Date(), Validators.required],
      cantidadCuotas: [1, [Validators.required, Validators.min(1)]],
      observacion: [''],
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
      const [monedas, proveedores] = await Promise.all([
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getProveedores()),
      ]);
      this.monedas = monedas || [];
      this.proveedores = proveedores || [];
      this.recalcDecimalesMoneda();
    } catch (e) { console.error(e); }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const f = this.form.value;
      await firstValueFrom(this.repositoryService.createCuentaPorPagar({
        descripcion: f.descripcion,
        tipo: f.tipo,
        proveedorId: f.proveedorId || null,
        montoTotal: f.montoTotal,
        monedaId: f.monedaId,
        fechaInicio: f.fechaInicio,
        cantidadCuotas: f.cantidadCuotas,
        observacion: f.observacion || null,
      }));
      this.snackBar.open('Cuenta por pagar creada', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al crear', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void { this.dialogRef?.close(false); }
}

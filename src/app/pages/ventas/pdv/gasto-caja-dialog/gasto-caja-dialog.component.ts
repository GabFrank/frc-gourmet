import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { preselectSingleOrPrincipal } from 'src/app/shared/utils/preselect';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

/**
 * Registra un gasto pagado con el efectivo de la caja de venta (PdV).
 * Descuenta del cajón de la caja abierta y aparece en el resumen de cierre.
 */
@Component({
  selector: 'app-create-gasto-caja-dialog',
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
  ],
  templateUrl: './gasto-caja-dialog.component.html',
  styleUrls: ['./gasto-caja-dialog.component.scss'],
})
export class CreateGastoCajaDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;

  cajaId = 0;
  cajaNombre = '';
  gastoId: number | null = null;
  isEditing = false;

  gastoCategorias: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  decimalesMoneda = 0;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CreateGastoCajaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaId = this.data?.cajaId || 0;
    this.cajaNombre = this.data?.cajaNombre || '';
    this.gastoId = this.data?.gastoId || null;
    this.isEditing = !!this.gastoId;

    this.form = this.fb.group({
      gastoCategoriaId: [null],
      descripcion: ['', Validators.required],
      monto: [null, [Validators.required, Validators.min(0.01)]],
      monedaId: [null, Validators.required],
      formaPagoId: [null, Validators.required],
      fecha: [new Date(), Validators.required],
    });

    // En modo edición, deshabilitar fecha, moneda, forma de pago
    if (this.isEditing) {
      this.form.get('fecha')?.disable();
      this.form.get('monedaId')?.disable();
      this.form.get('formaPagoId')?.disable();
    }

    // Reaccionar a cambios de moneda para actualizar decimales
    this.form.get('monedaId')?.valueChanges.subscribe(() => this.recalcDecimalesMoneda());

    this.loadLookups();
  }

  private recalcDecimalesMoneda(): void {
    const id = this.form?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  private async loadLookups(): Promise<void> {
    try {
      const [categorias, monedas, formasPago] = await Promise.all([
        firstValueFrom(this.repositoryService.getGastoCategorias()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
      ]);
      this.gastoCategorias = (categorias || []).filter((c: any) => c.activo !== false);
      this.monedas = monedas || [];
      this.formasPago = (formasPago || []).filter((f: any) => f.activo !== false);

      if (this.isEditing && this.gastoId) {
        await this.cargarGasto();
      } else {
        this.preseleccionar();
      }
    } catch (e) {
      console.error('Error cargando datos del gasto:', e);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 3000 });
    }
  }

  private async cargarGasto(): Promise<void> {
    try {
      const gasto = await firstValueFrom(this.repositoryService.getGastoCaja(this.gastoId!));
      this.form.patchValue({
        gastoCategoriaId: gasto.gastoCategoria?.id || null,
        descripcion: gasto.descripcion,
        monto: Number(gasto.monto),
        monedaId: gasto.moneda?.id || null,
        formaPagoId: gasto.formaPago?.id || null,
        fecha: gasto.fecha ? new Date(gasto.fecha) : new Date(),
      });
    } catch (e: any) {
      console.error('Error cargando gasto:', e);
      this.snackBar.open('Error al cargar el gasto', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close();
    }
  }

  private preseleccionar(): void {
    const monedaPrincipal = this.monedas.find((m: any) => m.principal) || this.monedas[0];
    if (monedaPrincipal) this.form.patchValue({ monedaId: monedaPrincipal.id });

    const efectivo = this.formasPago.find((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO'));
    const fp = efectivo || this.formasPago.find((f: any) => f.principal) || this.formasPago[0];
    if (fp) this.form.patchValue({ formaPagoId: fp.id });
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    try {
      const v = this.form.getRawValue(); // getRawValue incluye campos disabled

      if (this.isEditing && this.gastoId) {
        // Modo edición
        await firstValueFrom(this.repositoryService.editGastoCaja(this.gastoId, {
          descripcion: v.descripcion,
          monto: Number(v.monto),
          gastoCategoriaId: v.gastoCategoriaId || null,
        }));
        this.snackBar.open('Gasto actualizado', 'Cerrar', { duration: 2500 });
      } else {
        // Modo creación
        await firstValueFrom(this.repositoryService.createGastoCaja({
          cajaId: this.cajaId,
          gastoCategoriaId: v.gastoCategoriaId || null,
          descripcion: v.descripcion,
          monto: Number(v.monto),
          monedaId: v.monedaId,
          formaPagoId: v.formaPagoId,
          fecha: v.fecha,
        }));
        this.snackBar.open('Gasto registrado', 'Cerrar', { duration: 2500 });
      }
      this.dialogRef?.close({ success: true });
    } catch (e: any) {
      console.error('Error guardando gasto:', e);
      const msg = e?.message?.includes('Error invoking remote method')
        ? (this.isEditing ? 'Error al actualizar el gasto' : 'Error al registrar el gasto')
        : e?.message || (this.isEditing ? 'Error al actualizar el gasto' : 'Error al registrar el gasto');
      this.snackBar.open(msg, 'Cerrar', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  cancelar(): void {
    this.dialogRef?.close();
  }
}

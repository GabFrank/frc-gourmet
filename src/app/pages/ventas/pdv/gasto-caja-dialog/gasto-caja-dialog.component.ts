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
  ],
  templateUrl: './gasto-caja-dialog.component.html',
  styleUrls: ['./gasto-caja-dialog.component.scss'],
})
export class CreateGastoCajaDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;

  cajaId = 0;
  cajaNombre = '';

  gastoCategorias: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];

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

    this.form = this.fb.group({
      gastoCategoriaId: [null],
      descripcion: ['', Validators.required],
      monto: [null, [Validators.required, Validators.min(0.01)]],
      monedaId: [null, Validators.required],
      formaPagoId: [null, Validators.required],
      fecha: [new Date(), Validators.required],
    });

    this.loadLookups();
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
      this.preseleccionar();
    } catch (e) {
      console.error('Error cargando datos del gasto:', e);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 3000 });
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
      const v = this.form.value;
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
      this.dialogRef?.close({ success: true });
    } catch (e: any) {
      console.error('Error registrando gasto:', e);
      const msg = e?.message?.includes('Error invoking remote method')
        ? 'Error al registrar el gasto'
        : e?.message || 'Error al registrar el gasto';
      this.snackBar.open(msg, 'Cerrar', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  cancelar(): void {
    this.dialogRef?.close();
  }
}

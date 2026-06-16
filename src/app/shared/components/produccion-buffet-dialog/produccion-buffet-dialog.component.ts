import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';
import { Producto } from '../../../database/entities/productos/producto.entity';

export interface ProduccionBuffetDialogData {
  producto: Producto;
}

@Component({
  selector: 'app-produccion-buffet-dialog',
  templateUrl: './produccion-buffet-dialog.component.html',
  styleUrls: ['./produccion-buffet-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
})
export class ProduccionBuffetDialogComponent {
  form: FormGroup;
  isSaving = false;
  unidad: string;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<ProduccionBuffetDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ProduccionBuffetDialogData,
  ) {
    this.unidad = (data.producto?.unidadBase || 'KILOGRAMO').toString();
    const hoy = new Date();
    const fechaIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    this.form = this.fb.group({
      cantidadProducida: [null, [Validators.required, Validators.min(0.001)]],
      fecha: [fechaIso, [Validators.required]],
      observaciones: [''],
    });
  }

  guardar(): void {
    if (this.form.invalid || this.isSaving) return;
    this.isSaving = true;
    const v = this.form.value;
    this.repositoryService
      .crearProduccion({
        productoId: this.data.producto.id,
        cantidadProducida: Number(v.cantidadProducida),
        unidad: this.unidad,
        fecha: v.fecha,
        observaciones: v.observaciones || null,
      })
      .subscribe({
        next: (res: any) => {
          this.isSaving = false;
          if (res?.success) {
            this.snackBar.open(
              `Producción registrada (${res.insumos ?? 0} insumos descontados)`,
              'CERRAR',
              { duration: 3000, panelClass: ['success-snackbar'] },
            );
            this.dialogRef.close(true);
          } else {
            this.snackBar.open(res?.message || 'No se pudo registrar la producción', 'CERRAR', {
              duration: 5000,
              panelClass: ['error-snackbar'],
            });
          }
        },
        error: (err: any) => {
          this.isSaving = false;
          console.error('Error registrando producción:', err);
          this.snackBar.open('Error al registrar la producción', 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar'],
          });
        },
      });
  }

  cancelar(): void {
    this.dialogRef.close(false);
  }
}

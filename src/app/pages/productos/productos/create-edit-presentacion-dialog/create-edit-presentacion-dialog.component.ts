import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';
import { Presentacion, TipoMedida } from '../../../database/entities/productos/presentacion.entity';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  producto: Producto;
  presentacion?: Presentacion;
  editMode: boolean;
}

@Component({
  selector: 'app-create-edit-presentacion-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  templateUrl: './create-edit-presentacion-dialog.component.html',
  styleUrls: ['./create-edit-presentacion-dialog.component.scss']
})
export class CreateEditPresentacionDialogComponent implements OnInit {
  presentacionForm: FormGroup;
  loading = false;
  tipoMedida = TipoMedida;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditPresentacionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.presentacionForm = this.fb.group({
      descripcion: ['', Validators.required],
      tipoMedida: [TipoMedida.UNIDAD, Validators.required],
      cantidad: [1, [Validators.required, Validators.min(0.1)]],
      principal: [false],
      activo: [true]
    });
  }

  ngOnInit(): void {
    if (this.data.editMode && this.data.presentacion) {
      this.presentacionForm.patchValue({
        descripcion: this.data.presentacion.descripcion || '',
        tipoMedida: this.data.presentacion.tipoMedida || TipoMedida.UNIDAD,
        cantidad: this.data.presentacion.cantidad || 1,
        principal: this.data.presentacion.principal || false,
        activo: this.data.presentacion.activo !== undefined ? this.data.presentacion.activo : true
      });
    }
  }

  async save(): Promise<void> {
    if (this.presentacionForm.invalid) {
      return;
    }

    this.loading = true;

    try {
      const formValues = this.presentacionForm.value;

      // Convert string values to uppercase
      if (formValues.descripcion) {
        formValues.descripcion = formValues.descripcion.toUpperCase();
      }

      if (this.data.editMode && this.data.presentacion && this.data.presentacion.id) {
        // Update existing presentacion - only update the fields we want to change
        this.repositoryService.updatePresentacion(this.data.presentacion.id, {
          descripcion: formValues.descripcion,
          tipoMedida: formValues.tipoMedida,
          cantidad: formValues.cantidad,
          principal: formValues.principal,
          activo: formValues.activo
        }).subscribe({
          next: () => {
            this.loading = false;
            this.dialogRef.close(true);
          },
          error: (error: any) => {
            console.error('Error updating presentacion:', error);
            this.snackBar.open('Error al guardar la presentación', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        });
      } else {
        // Create new presentacion - only provide the required fields
        await firstValueFrom(
          this.repositoryService.createPresentacion({
            productoId: this.data.producto.id,
            descripcion: formValues.descripcion,
            tipoMedida: formValues.tipoMedida,
            cantidad: formValues.cantidad,
            principal: formValues.principal,
            activo: formValues.activo
          })
        );
        this.snackBar.open('Presentación creada exitosamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving presentacion:', error);
      this.snackBar.open('Error al guardar la presentación', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }
}

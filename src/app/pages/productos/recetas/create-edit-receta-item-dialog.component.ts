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
import { RecetaItem } from '../../../database/entities/productos/receta-item.entity';
import { Ingrediente } from '../../../database/entities/productos/ingrediente.entity';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  recetaId: number;
  recetaItem?: RecetaItem;
  editMode: boolean;
  ingredientes: Ingrediente[];
}

@Component({
  selector: 'app-create-edit-receta-item-dialog',
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
  templateUrl: './create-edit-receta-item-dialog.component.html',
  styleUrls: ['./create-edit-receta-item-dialog.component.scss']
})
export class CreateEditRecetaItemDialogComponent implements OnInit {
  recetaItemForm: FormGroup;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditRecetaItemDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.recetaItemForm = this.fb.group({
      ingredienteId: ['', Validators.required],
      cantidad: [0, [Validators.required, Validators.min(0.01)]],
      activo: [true]
    });
  }

  ngOnInit(): void {
    if (this.data.editMode && this.data.recetaItem) {
      this.recetaItemForm.patchValue({
        ingredienteId: this.data.recetaItem.ingredienteId,
        cantidad: this.data.recetaItem.cantidad,
        activo: this.data.recetaItem.activo
      });
    }
  }

  async save(): Promise<void> {
    if (this.recetaItemForm.invalid) {
      this.recetaItemForm.markAllAsTouched();
      return;
    }

    this.loading = true;

    try {
      const formValues = this.recetaItemForm.value;

      if (this.data.editMode && this.data.recetaItem) {
        // Update existing receta item
        await firstValueFrom(this.repositoryService.updateRecetaItem(this.data.recetaItem.id, {
          ingredienteId: formValues.ingredienteId,
          cantidad: formValues.cantidad,
          activo: formValues.activo
        }));
        this.snackBar.open('Ingrediente actualizado correctamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new receta item
        await firstValueFrom(this.repositoryService.createRecetaItem({
          recetaId: this.data.recetaId,
          ingredienteId: formValues.ingredienteId,
          cantidad: formValues.cantidad,
          activo: formValues.activo
        }));
        this.snackBar.open('Ingrediente agregado correctamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving receta item:', error);
      this.snackBar.open('Error al guardar el ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  getIngredienteName(ingredienteId: number): string {
    const ingrediente = this.data.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.descripcion : 'Desconocido';
  }
}

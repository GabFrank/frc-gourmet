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
import { RecetaVariacion } from '../../../../database/entities/productos/receta-variacion.entity';
import { Ingrediente } from '../../../../database/entities/productos/ingrediente.entity';

export interface VariacionItemDialogData {
  variacion: RecetaVariacion;
  ingredientes: Ingrediente[];
  itemId?: number; // For editing existing item
  ingredienteId?: number; // Pre-selected ingredient
  cantidad?: number; // Pre-filled quantity
}

@Component({
  selector: 'app-create-edit-receta-variacion-item',
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
    MatDialogModule
  ],
  templateUrl: './create-edit-receta-variacion-item.component.html',
  styleUrls: ['./create-edit-receta-variacion-item.component.scss']
})
export class CreateEditRecetaVariacionItemComponent implements OnInit {
  itemForm: FormGroup;
  isEditing = false;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditRecetaVariacionItemComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VariacionItemDialogData
  ) {
    // Check if we're editing by examining if itemId is provided
    this.isEditing = !!data.itemId;
    
    // Initialize the form with data if available
    this.itemForm = this.fb.group({
      ingredienteId: [data.ingredienteId || '', Validators.required],
      cantidad: [data.cantidad || 1, [Validators.required, Validators.min(0.01)]]
    });
  }

  ngOnInit(): void {
    // Subscribe to changes in the selected ingredient
    this.itemForm.get('ingredienteId')?.valueChanges.subscribe(() => {
      // This will trigger change detection which will update the label
      // No need to explicitly do anything here
    });
  }

  getSelectedIngredientTipoMedida(): string {
    const ingredienteId = this.itemForm?.get('ingredienteId')?.value;
    if (!ingredienteId) return '';
    
    const ingrediente = this.data.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.tipoMedida : '';
  }

  save(): void {
    if (this.itemForm.invalid) {
      this.itemForm.markAllAsTouched();
      return;
    }

    const formValues = this.itemForm.value;
    
    // Return data with the id if we're editing
    this.dialogRef.close({
      ingredienteId: formValues.ingredienteId,
      cantidad: formValues.cantidad,
      itemId: this.data.itemId, // This will be undefined when creating a new item
      isEditing: this.isEditing
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  // Helper method to get ingredient name by ID
  getIngredienteName(id: number): string {
    const ingrediente = this.data.ingredientes.find(i => i.id === id);
    return ingrediente ? ingrediente.descripcion : 'Desconocido';
  }
}

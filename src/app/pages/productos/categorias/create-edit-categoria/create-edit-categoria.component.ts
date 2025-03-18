import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../../database/repository.service';
import { Categoria } from '../../../../database/entities/productos/categoria.entity';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  id?: number;
  defaultPosition?: number;
}

@Component({
  selector: 'app-create-edit-categoria',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    ReactiveFormsModule
  ],
  templateUrl: './create-edit-categoria.component.html',
  styleUrls: ['./create-edit-categoria.component.scss']
})
export class CreateEditCategoriaComponent implements OnInit {
  categoriaForm: FormGroup;
  isEditing = false;
  isLoading = false;
  allCategorias: Categoria[] = [];

  constructor(
    private dialogRef: MatDialogRef<CreateEditCategoriaComponent>,
    @Inject(MAT_DIALOG_DATA) private data: DialogData,
    private fb: FormBuilder,
    private repository: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    const initialPosition = data?.defaultPosition !== undefined ? data.defaultPosition : 0;
    
    this.categoriaForm = this.fb.group({
      nombre: ['', [Validators.required]],
      descripcion: [''],
      posicion: [initialPosition, [Validators.required, Validators.min(0)]],
      activo: [true]
    });

    this.isEditing = !!data?.id;
    
    if (initialPosition > 0) {
      console.log(`Using initial position: ${initialPosition} for new category`);
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      // Load all categories to check for duplicates
      this.allCategorias = await firstValueFrom(this.repository.getCategorias());
      
      if (this.isEditing && this.data.id) {
        this.loadCategoria(this.data.id);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }

  loadCategoria(id: number): void {
    this.isLoading = true;

    this.repository.getCategoria(id).subscribe({
      next: (categoria) => {
        if (categoria) {
          this.categoriaForm.patchValue({
            nombre: categoria.nombre,
            descripcion: categoria.descripcion || '',
            posicion: categoria.posicion,
            activo: categoria.activo
          });
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading categoria:', error);
        this.isLoading = false;
      }
    });
  }

  onSubmit(): void {
    if (this.categoriaForm.invalid) {
      return;
    }

    this.isLoading = true;
    const formData = this.categoriaForm.value;

    // Convert string fields to uppercase
    if (formData.nombre) {
      formData.nombre = formData.nombre.toUpperCase();
    }
    if (formData.descripcion) {
      formData.descripcion = formData.descripcion.toUpperCase();
    }

    // Check for duplicate category name
    const normalizedName = formData.nombre.trim().toUpperCase();
    const duplicateCategoria = this.allCategorias.find(c => 
      c.nombre && c.nombre.trim().toUpperCase() === normalizedName && 
      (!this.isEditing || c.id !== this.data.id)
    );

    if (duplicateCategoria) {
      this.snackBar.open('Ya existe una categoría con este nombre', 'Cerrar', {
        duration: 5000
      });
      this.isLoading = false;
      return;
    }

    console.log('Submitting categoria form:', formData);

    if (this.isEditing && this.data.id) {
      console.log('Updating categoria with ID:', this.data.id);
      this.repository.updateCategoria(this.data.id, formData).subscribe({
        next: (result) => {
          console.log('Categoria updated successfully:', result);
          this.dialogRef.close({
            success: true,
            action: 'update',
            categoria: result
          });
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error updating categoria:', error);
          this.isLoading = false;
          this.dialogRef.close({
            success: false,
            error
          });
        }
      });
    } else {
      console.log('Creating new categoria');
      this.repository.createCategoria(formData).subscribe({
        next: (result) => {
          console.log('Categoria created successfully:', result);
          this.dialogRef.close({
            success: true,
            action: 'create',
            categoria: result
          });
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error creating categoria:', error);
          this.isLoading = false;
          this.dialogRef.close({
            success: false,
            error
          });
        }
      });
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  // Helper method to mark all form controls as touched to trigger validation errors
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }
}

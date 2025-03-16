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
import { RepositoryService } from '../../../database/repository.service';
import { Subcategoria } from '../../../database/entities/productos/subcategoria.entity';
import { Categoria } from '../../../database/entities/productos/categoria.entity';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-create-edit-subcategoria',
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
    ReactiveFormsModule
  ],
  templateUrl: './create-edit-subcategoria.component.html',
  styleUrls: ['./create-edit-subcategoria.component.scss']
})
export class CreateEditSubcategoriaComponent implements OnInit {
  subcategoriaForm: FormGroup;
  isEditing = false;
  loading = false;
  categorias: Categoria[] = [];
  
  constructor(
    private dialogRef: MatDialogRef<CreateEditSubcategoriaComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { subcategoria?: Subcategoria },
    private fb: FormBuilder,
    private repositoryService: RepositoryService
  ) {
    this.subcategoriaForm = this.fb.group({
      nombre: ['', [Validators.required]],
      descripcion: [''],
      categoriaId: [null, [Validators.required]],
      posicion: [0, [Validators.required, Validators.min(0)]],
      activo: [true]
    });
    
    this.isEditing = !!this.data.subcategoria;
  }

  ngOnInit(): void {
    this.loadCategorias();
    
    if (this.isEditing && this.data.subcategoria) {
      this.loadSubcategoria();
    }
  }
  
  async loadCategorias(): Promise<void> {
    this.loading = true;
    try {
      this.categorias = await firstValueFrom(this.repositoryService.getCategorias());
      // Sort categorias by nombre
      this.categorias.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } catch (error) {
      console.error('Error loading categorias:', error);
    } finally {
      this.loading = false;
    }
  }

  loadSubcategoria(): void {
    if (!this.data.subcategoria) return;
    
    this.loading = true;
    try {
      // Patch form with existing subcategoria data
      this.subcategoriaForm.patchValue({
        nombre: this.data.subcategoria.nombre,
        descripcion: this.data.subcategoria.descripcion || '',
        categoriaId: this.data.subcategoria.categoriaId,
        posicion: this.data.subcategoria.posicion,
        activo: this.data.subcategoria.activo
      });
    } catch (error) {
      console.error('Error loading subcategoria data:', error);
    } finally {
      this.loading = false;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.subcategoriaForm.invalid) {
      this.markFormGroupTouched(this.subcategoriaForm);
      return;
    }

    this.loading = true;
    const formData = this.subcategoriaForm.value;
    
    // Convert string fields to uppercase
    const subcategoriaData = {
      ...formData,
      nombre: formData.nombre?.toUpperCase() || '',
      descripcion: formData.descripcion?.toUpperCase() || ''
    };
    
    try {
      if (this.isEditing && this.data.subcategoria) {
        // Update existing subcategoria
        const updatedSubcategoria = await firstValueFrom(this.repositoryService.updateSubcategoria(this.data.subcategoria.id!, subcategoriaData));
        this.dialogRef.close({ success: true, action: 'update', subcategoria: updatedSubcategoria });
      } else {
        // Create new subcategoria
        const createdSubcategoria = await firstValueFrom(this.repositoryService.createSubcategoria(subcategoriaData));
        this.dialogRef.close({ success: true, action: 'create', subcategoria: createdSubcategoria });
      }
    } catch (error) {
      console.error('Error saving subcategoria:', error);
      this.dialogRef.close({ success: false, error });
    } finally {
      this.loading = false;
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